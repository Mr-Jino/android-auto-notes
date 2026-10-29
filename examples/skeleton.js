/**
 * AutoJs6 自动化骨架 · 三档降级 + 可停止 + 失败自证
 * ================================================
 * 把 SELECTORS / COORDS 换成目标 App 的值即可，其余逻辑不用动。
 *
 * 设计原则（详见 README）：
 *   1. click() 返回 true ≠ 点击生效  -> 自绘控件用 press 带时长
 *   2. 不写死等待                    -> 每轮重新判断状态
 *   3. 三档降级                      -> 文字 / 计时 / 坐标
 *   4. 有停止通道                    -> 悬浮窗 + 信号文件
 *   5. 失败自证                      -> 连试多次无反应就 dump 节点树
 */

var CFG = {
  pollMs: 1200,            // 轮询间隔
  pressMs: 120,            // 按压时长：自绘控件对 0ms 无响应
  stopPath: "/sdcard/auto_STOP",   // 建这个文件 = 立刻停（不依赖 UI）
  maxRetry: 5,             // 同一目标最多重试几次后 dump 现场
  logThrottleMs: 3000,     // 高频日志节流
};

// —— 换成目标 App 的文字 / 坐标 ——
var SELECTORS = {
  mainEntry: "免费听",       // 页面上能读到的文字
  targetBtn: "领取成功",
  rescueDlg: "继续观看",     // 误触后出现的"救回"弹窗
};
var COORDS = {
  targetBtn: {x: 980, y: 120},   // 文字读不到时的兜底坐标
};

var lastLog = 0;
function tlog(msg) {
  var now = Date.now();
  if (now - lastLog < CFG.logThrottleMs) return;
  lastLog = now;
  log(msg);
}

/** 带时长的按压：自绘控件对 0ms 瞬时点击不响应 */
function pressXY(x, y, ms, why) {
  press(x, y, ms);
  log("press(" + x + "," + y + "," + ms + "ms) " + (why || ""));
}

/** 在节点列表里按文字模糊挑一个 */
function pick(nodes, candidates) {
  if (!nodes) return null;
  for (var i = 0; i < nodes.length; i++) {
    for (var j = 0; j < candidates.length; j++) {
      if (nodes[i].text() && nodes[i].text().indexOf(candidates[j]) >= 0) return nodes[i];
    }
  }
  return null;
}

/** 停止信号：不依赖任何 UI */
function shouldStop() {
  if (files.exists(CFG.stopPath)) {
    log(">> 检测到停止信号，退出");
    try { files.remove(CFG.stopPath); } catch (e) {}
    return true;
  }
  return false;
}

/** 失败自证：把现场留下来，别再猜 */
function dumpAllNodes() {
  var root = className("android.widget.FrameLayout").findOnce();
  var all = root ? root.find() : [];
  log("==== dump " + all.length + " nodes ====");
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    if (n.text() || n.desc()) {
      log(i + " | " + n.className() + " | text=" + n.text() + " | desc=" + n.desc() +
          " | bounds=" + n.bounds().left + "," + n.bounds().top);
    }
  }
  log("==== dump end ====");
}

/**
 * 三档降级点一次目标
 *   1 文字模式：无障碍读得到就按文字点（最稳，抗改版）
 *   2 坐标模式：读不到就按稳定坐标 + 带时长按压
 *   3 返回 false 让调用方决定是否退化成定时
 */
function tapTarget(label) {
  var node = text(label).findOne(800);
  if (node) { pressXY(Math.round(node.bounds().centerX()), Math.round(node.bounds().centerY()), CFG.pressMs, label); return "text"; }
  var c = COORDS.targetBtn;
  if (c) { pressXY(c.x, c.y, CFG.pressMs, label + "(坐标兜底)"); return "coord"; }
  return null;
}

/** 等待某个文字消失：能读到进度就不写死时长 */
function waitUntilGone(label, timeoutMs) {
  var start = Date.now();
  while (Date.now() - start < (timeoutMs || 60000)) {
    if (shouldStop()) return false;
    if (!textContains(label).findOnce()) return true;
    var rescue = pick(textContains("").find(), [SELECTORS.rescueDlg]);
    if (rescue) { pressXY(Math.round(rescue.bounds().centerX()), Math.round(rescue.bounds().centerY()), CFG.pressMs, "救回弹窗"); }
    sleep(CFG.pollMs);
  }
  return false;
}

// —— 主循环 ——
var attempt = 0;
while (true) {
  if (shouldStop()) break;

  var mode = tapTarget(SELECTORS.targetBtn);
  if (mode === null) {
    attempt++;
    tlog("未找到目标，第 " + attempt + " 次");
    if (attempt >= CFG.maxRetry) { dumpAllNodes(); attempt = 0; }
    sleep(CFG.pollMs);
    continue;
  }
  attempt = 0;

  if (!waitUntilGone(SELECTORS.targetBtn, 60000)) {
    tlog("等待超时，重试");
  }
}
