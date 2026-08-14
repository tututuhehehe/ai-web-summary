  function requestAIStream(messages, onComplete, onError, assistantBubble) {
    if (!aiConfig.apiKey) {
      onError("请先点击右上角⚙️图标配置 API Key");
      return;
    }

    const selectedModel = document.getElementById("ai-model-select").value;
    isRequesting = true;
    const mySeq = ++requestSeq; // 本次请求的序号,后续回调需校验是否仍为最新
    const REQUEST_TIMEOUT_MS = 180000; // 整体请求超时
    const STREAM_IDLE_TIMEOUT_MS = 45000; // 流式响应超过该时间无增量则视为卡住
    // 判断本次请求是否已被新请求/路由切换作废,或目标 bubble 已脱离文档
    function isStale() {
      if (mySeq !== requestSeq) return true;
      if (assistantBubble && !assistantBubble.isConnected) return true;
      return false;
    }
    updateChatSendButtonState();

    const payload = {
      model: selectedModel,
      messages: buildRequestMessages(messages),
      temperature: 0.3,
      stream: true,
      stream_options: { include_usage: true }, // 请求接口在流末返回 token 用量
    };

    // 根据服务商组装思考模式参数(统一写入 extra_body)
    applyThinkingParams(payload, aiConfig);

    currentRequest = GM_xmlhttpRequest({
      method: "POST",
      url: aiConfig.endpoint,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`,
        Accept: "text/event-stream",
      },
      data: JSON.stringify(payload),
      responseType: "stream",
      timeout: REQUEST_TIMEOUT_MS,
      onloadstart: async function (response) {
        try {
          if (response.status && (response.status < 200 || response.status >= 300)) {
            throw new Error(`HTTP ${response.status}: ${response.statusText || "请求失败"}`);
          }
          if (!response.response || typeof response.response.getReader !== "function") {
            throw new Error("当前用户脚本管理器不支持 GM_xmlhttpRequest 的流式读取(responseType: stream),请升级 Tampermonkey/Violentmonkey 后重试");
          }
          const reader = response.response.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          let reasoningContent = "";
          let mainContent = "";

          let committedMain = "";
          let committedSegments = []; // 已定稿的段落原文数组,每段对应一个独立 DOM 节点
          let renderedSegCount = 0; // 已 append 到页面的段落数,旧节点从不重建
          let pendingMain = "";
          let rafId = null;
          let lastRenderedPending = null; // 上次实际渲染到 DOM 的 pending 内容,用于去重跳过
          let lastPendingRenderTs = 0; // 上次 pending 段实际渲染的时间戳,用于时间节流
          let tailTimer = null; // 节流跳过时的尾帧兜底定时器
          let receivedError = "";
          let idleTimer = null;
          function clearIdleTimer() {
            if (idleTimer) {
              clearTimeout(idleTimer);
              idleTimer = null;
            }
          }
          function touchIdleTimer() {
            clearIdleTimer();
            idleTimer = setTimeout(() => {
              if (isStale()) return;
              receivedError = `AI 响应超时:超过 ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)} 秒未收到新内容`;
              try {
                currentRequest?.abort?.();
              } catch (e) {}
            }, STREAM_IDLE_TIMEOUT_MS);
          }
          let thinkStartTime = 0; // 思考(reasoning)首次出现的时间戳
          let thinkSeconds = 0; // 已思考秒数(一秒一秒跳动)
          let thinkTimer = null; // 思考计时器,每秒刷新标题
          let usageInfo = null; // 接口返回的 token 用量(prompt/completion)

          // 解析一批 SSE 文本行,提取 reasoning/content 增量
          function processLines(lines) {
            for (let line of lines) {
              line = line.trim();
              if (!line.startsWith("data:")) {
                // 非 SSE 行:可能是接口返回的 JSON 错误体,尝试提取错误信息
                if (line && !receivedError) {
                  try {
                    const errObj = JSON.parse(line);
                    const msg =
                      errObj?.error?.message || errObj?.message || errObj?.msg;
                    if (msg) receivedError = "接口错误: " + msg;
                  } catch (e) {}
                }
                continue;
              }
              const dataStr = line.substring(line.indexOf(":") + 1).trim();
              if (dataStr === "[DONE]") continue;
              try {
                const data = JSON.parse(dataStr);
                if (data?.error) {
                  const msg = data.error.message || JSON.stringify(data.error);
                  if (!receivedError) receivedError = "接口错误: " + msg;
                  continue;
                }
                if (data?.usage) usageInfo = data.usage; // 捕获 token 用量(可能在 delta 为空的末 chunk)
                const delta = data?.choices?.[0]?.delta;
                if (!delta) continue;
                // 思考增量字段兼容不同服务商:阿里云/DeepSeek 为 reasoning_content,
                // Groq(gpt-oss 系)为 reasoning
                const reasoningDelta =
                  delta.reasoning_content ?? delta.reasoning;
                if (reasoningDelta) {
                  reasoningContent += reasoningDelta;
                  // 首次收到思考内容:启动每秒计时,让标题秒数一秒一秒跳
                  if (!thinkStartTime) {
                    thinkStartTime = Date.now();
                    thinkTimer = setInterval(() => {
                      thinkSeconds = Math.floor(
                        (Date.now() - thinkStartTime) / 1000,
                      );
                      // 正文尚未出现时才需持续刷新思考秒数
                      if (!mainContent) {
                        doRender(false);
                      }
                    }, 1000);
                  }
                }
                if (delta.content) {
                  // 首次出现正文:停止思考计时,定格耗时秒数
                  if (thinkTimer && !mainContent) stopThinkTimer();
                  mainContent += delta.content;
                  pendingMain += delta.content;
                }
                scheduleRender();
              } catch (e) {}
            }
          }

          // 停止思考计时器并定格最终秒数
          function stopThinkTimer() {
            // 仅在计时器仍在运行(真正从"思考中"切到"停止")的那一刻定格秒数。
            // 后续重复调用(如流结束时再调一次)不再重算,否则会把正文生成耗时也算进去。
            if (thinkTimer) {
              clearInterval(thinkTimer);
              thinkTimer = null;
              if (thinkStartTime) {
                thinkSeconds = Math.floor((Date.now() - thinkStartTime) / 1000);
              }
            }
            if (tailTimer) {
              // 顺带清尾帧定时器,避免向已结束/作废的请求继续写入
              clearTimeout(tailTimer);
              tailTimer = null;
            }
          }

          function scheduleRender() {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
              rafId = null;
              doRender(false);
            });
          }

          function doRender(isFinal) {
            if (isStale()) return; // 请求已作废或 bubble 已移除,不再写入

            // 推进 committed/pending 拆分:将最后一个段落边界之前的内容定稿。
            // 为避免把未闭合的代码块(```)从中间切断导致渲染错乱,
            // 只有当拟定稿部分的反引号成对(偶数)时才提交。
            if (pendingMain && (isFinal || /\n\n/.test(pendingMain))) {
              let newlyCommitted = "";
              if (isFinal) {
                newlyCommitted = pendingMain;
                pendingMain = "";
              } else {
                const splitAt = pendingMain.lastIndexOf("\n\n") + 2;
                if (splitAt > 0) {
                  const candidate = pendingMain.slice(0, splitAt);
                  const fenceCount = (
                    (committedMain + candidate).match(/```/g) || []
                  ).length;
                  if (fenceCount % 2 === 0) {
                    newlyCommitted = candidate;
                    pendingMain = pendingMain.slice(splitAt);
                  }
                }
              }
              if (newlyCommitted) {
                committedMain += newlyCommitted;
                // 拆成独立段落(以空行分隔),每段单独成一个 DOM 节点
                newlyCommitted
                  .split(/\n{2,}/)
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0)
                  .forEach((seg) => committedSegments.push(seg));
              }
            }

            // 确保气泡内有思考槽与正文槽两个独立容器,只创建一次。
            // 正文槽再拆为 committed(已定稿、不再重写)+ pending(生成中、每帧重写),
            // 让已输出的段落 DOM 保持稳定,流式中也能正常选中/复制
            let mainSlot = assistantBubble.querySelector(".ai-main-slot");
            if (!mainSlot) {
              assistantBubble.innerHTML =
                '<div class="ai-think-slot"></div>' +
                '<div class="ai-main-slot"><div class="ai-committed"></div><div class="ai-pending"></div></div>';
              mainSlot = assistantBubble.querySelector(".ai-main-slot");
              renderedSegCount = 0; // 新容器,重置已 append 段数
            }

            // 思考框:增量更新,从不重建,保留用户展开/折叠状态
            if (reasoningContent) {
              const thinkSlot = assistantBubble.querySelector(".ai-think-slot");
              let det = thinkSlot.querySelector("details.ai-think-box");
              if (!det) {
                thinkSlot.innerHTML =
                  `<details class="ai-think-box" style="margin-bottom:8px;">` +
                  `<summary class="ai-think-summary" style="color:var(--text-mute);font-size:12px;cursor:pointer;user-select:none;"></summary>` +
                  `<div class="ai-think-content" style="color:var(--text-faint);font-size:12px;padding:8px;background:var(--bg-think);border-radius:6px;margin-top:4px;white-space:pre-wrap;"></div></details>`;
                det = thinkSlot.querySelector("details.ai-think-box");
              }
              const thinking = !isFinal && !mainContent;
              det.querySelector(".ai-think-summary").textContent = thinking
                ? `💭 思考中... (${thinkSeconds}s)`
                : `💭 思考过程 (耗时 ${thinkSeconds}s)`;
              det.querySelector(".ai-think-content").textContent =
                reasoningContent;
            }

            // 流结束时用完整正文做一次整体 Markdown 渲染。
            // 流式阶段为保证已输出段落可稳定选中/复制，会按空行拆成独立 DOM 节点；
            // 但分别调用 marked.parse 会破坏跨段 Markdown 结构（例如带空行的有序列表
            // 会重新从 1 编号）。最终整体渲染可恢复列表、引用、嵌套块等完整语义。
            if (isFinal && mainContent) {
              mainSlot.innerHTML = renderMarkdown(mainContent);
              return;
            }

            // 正文:committed 每段作为独立 DOM 节点,只 append 新增段落,旧节点永不重建
            // (复制任何已完成段落都不受后续输出影响);pending 每帧重写。两者都不影响思考框。
            const committedEl = mainSlot.querySelector(".ai-committed");
            const pendingEl = mainSlot.querySelector(".ai-pending");
            if (committedEl) {
              for (
                let i = renderedSegCount;
                i < committedSegments.length;
                i++
              ) {
                const segEl = document.createElement("div");
                segEl.className = "ai-seg";
                segEl.innerHTML = renderMarkdown(committedSegments[i]);
                committedEl.appendChild(segEl);
              }
              renderedSegCount = committedSegments.length;
            }
            // pending 段渲染:committed 推进与思考框更新已在上方每帧执行完毕,
            // 这里只对"正文未定稿段"的 marked.parse + innerHTML 做节流,降低长段落的重解析开销。
            // 规则:1内容未变则跳过;2距上次渲染不足 PENDING_RENDER_MS 则跳过,但挂一个尾帧兜底
            //       定时器保证最终会渲染;3isFinal(流结束)无条件完整渲染,绝不被节流跳过。
            if (pendingEl) {
              const PENDING_RENDER_MS = 80;

              // 计算并写入本帧应显示的 pending HTML
              const renderPending = () => {
                if (tailTimer) {
                  clearTimeout(tailTimer);
                  tailTimer = null;
                }
                if (pendingMain) {
                  pendingEl.innerHTML = !isFinal
                    ? renderMarkdown(pendingMain) +
                      '<span style="color:var(--accent);opacity:0.6;">▍</span>'
                    : renderMarkdown(pendingMain);
                } else if (!committedMain && reasoningContent) {
                  pendingEl.innerHTML =
                    '<span style="color:var(--text-faint);">AI 深度思考中...</span>';
                } else {
                  pendingEl.innerHTML = "";
                }
                lastRenderedPending = pendingMain;
                lastPendingRenderTs = Date.now();
              };

              if (isFinal) {
                renderPending(); // 流结束:强制渲染,定格最终态
              } else if (pendingMain === lastRenderedPending) {
                // 内容未变(如仅思考计时刷新触发的本帧):跳过 parse
              } else if (
                Date.now() - lastPendingRenderTs >=
                PENDING_RENDER_MS
              ) {
                renderPending();
              } else if (!tailTimer) {
                // 距上次渲染过近:本帧跳过,挂尾帧兜底,保证这段增量最终会显示
                tailTimer = setTimeout(() => {
                  tailTimer = null;
                  if (isStale()) return;
                  scheduleRender(); // 走正常帧渲染路径
                }, PENDING_RENDER_MS);
              }
            }
          }

          touchIdleTimer();
          while (true) {
            if (isStale()) {
              stopThinkTimer();
              clearIdleTimer();
              try {
                await reader.cancel();
              } catch (e) {}
              return;
            }
            const { done, value } = await reader.read();
            if (done) break;
            touchIdleTimer();

            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            processLines(lines);
          }

          // 流结束,停止思考计时
          stopThinkTimer();
          clearIdleTimer();

          // 冲刷解码器与最后一行(末尾可能没有换行符,否则丢失最后一个 token)
          buffer += decoder.decode();
          if (buffer.trim()) processLines([buffer]);

          if (isStale()) return; // 请求已作废,不再触发完成/错误回调

          // 如果整个流未产生任何内容,可能是接口返回了非 SSE 的错误体
          if (!mainContent && !reasoningContent) {
            isRequesting = false;
            currentRequest = null;
            onError(
              receivedError ||
                "AI 未返回内容,请检查模型名称、API Key 或接口配置",
            );
            updateChatSendButtonState();
            return;
          }

          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          doRender(true);
          isRequesting = false;
          currentRequest = null;
          updateTokenBar(usageInfo);
          // 仅把正文(content)交给上层写入历史;思考内容(reasoning_content)不作为
          // 正式回答进入 chatHistory,避免模型在后续多轮里把自己的"思考"当成已说过的回答。
          // 显示已由上面的 doRender(true) 完成(含思考折叠框),此处参数只影响历史。
          onComplete(mainContent);
          updateChatSendButtonState();
        } catch (err) {
          try {
            stopThinkTimer();
          } catch (e) {}
          try {
            clearIdleTimer();
          } catch (e) {}
          if (isStale()) return; // 主动中断导致的异常,静默忽略
          isRequesting = false;
          currentRequest = null;
          onError(receivedError || err?.message || "流读取中断");
          updateChatSendButtonState();
        }
      },
      onerror: function (err) {
        if (isStale()) return;
        isRequesting = false;
        currentRequest = null;
        onError(err?.error || err?.message || "网络请求失败,请检查配置或网络");
        updateChatSendButtonState();
      },
      ontimeout: function () {
        if (isStale()) return;
        isRequesting = false;
        currentRequest = null;
        onError(`请求超时:超过 ${Math.round(REQUEST_TIMEOUT_MS / 1000)} 秒未完成`);
        updateChatSendButtonState();
      },
    });
  }

