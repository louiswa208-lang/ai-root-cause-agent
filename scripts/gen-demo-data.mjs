/**
 * 生成演示数据：一份 91 天的明细数据 + 事件时间轴。
 * 数据为方法演示数据，非真实业务数据；注入四种不同类型的异常，用于验证 Agent 会走不同的 Graph 路径。
 *
 *   2026-09-05  交易层：品类结构迁移导致客单价下降    → 期望路径 decompose_metric → price_structure_diagnosis
 *   2026-09-10  互动层：某版本作者回复数下降          → 期望路径 locate_business_layer → interaction_diagnosis
 *   2026-09-11  跨层  ：埋点异常导致数据覆盖骤降      → 期望路径 validate_dataset → data_quality_stop
 *   2026-09-12  搜索层：出词策略调整导致 L1 下降      → 期望路径 decompose_metric → search_diagnosis
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "demo");
mkdirSync(OUT_DIR, { recursive: true });

const SCENES = ["推荐", "搜索", "关注"];
const CATEGORIES = ["美妆", "数码", "家居", "服饰"];
const TIERS = ["头部", "腰部", "尾部"];
const VERSIONS = ["v28.1", "v28.2"];

const AOV = { 美妆: 96, 数码: 430, 家居: 168, 服饰: 128 };
const SCENE_BASE = { 推荐: 1, 搜索: 0.42, 关注: 0.33 };
const CAT_BASE = { 美妆: 1, 数码: 0.72, 家居: 0.6, 服饰: 0.85 };
const TIER_BASE = { 头部: 1, 腰部: 0.62, 尾部: 0.3 };
const VER_SHARE = { "v28.1": 0.45, "v28.2": 0.55 };
const REPLY_RATE = { 头部: 0.22, 腰部: 0.38, 尾部: 0.52 };

// 确定性伪随机，保证每次生成的数据一致
let seed = 20260912;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function jitter(scale = 0.04) {
  return 1 + (rand() - 0.5) * 2 * scale;
}

function dateRange(start, days) {
  const out = [];
  const d = new Date(start + "T00:00:00Z");
  for (let i = 0; i < days; i += 1) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const DATES = dateRange("2026-06-14", 91); // 至 2026-09-12
const WEEKDAY_FACTOR = [1.12, 0.94, 0.95, 0.97, 1.0, 1.08, 1.15]; // 周日..周六

const rows = [];
for (const date of DATES) {
  const dow = new Date(date + "T00:00:00Z").getUTCDay();
  const wf = WEEKDAY_FACTOR[dow];
  // 09-11 埋点异常：只有推荐场景上报成功，明细行数骤降
  const brokenTracking = date === "2026-09-11";
  for (const scene of SCENES) {
    if (brokenTracking && scene !== "推荐") continue;
    for (const category of CATEGORIES) {
      for (const author_tier of TIERS) {
        for (const app_version of VERSIONS) {
          let exposure = 520000 * SCENE_BASE[scene] * CAT_BASE[category] * TIER_BASE[author_tier] * VER_SHARE[app_version] * wf * jitter();
          let viewRate = 0.315 * jitter(0.02);
          let l1Rate = 0.0125 * jitter(0.03);
          let l2Rate = 0.0082 * jitter(0.03);
          let convRate = 0.101 * jitter(0.03);
          let aov = AOV[category] * jitter(0.02);
          let replyRate = REPLY_RATE[author_tier] * jitter(0.05);
          let ctr = 0.052 * jitter(0.03);
          const commentRate = 0.031 * jitter(0.04);

          // 注入 1：2026-09-05 品类结构迁移（美妆放量、数码收缩），单品类客单价不变
          if (date === "2026-09-05") {
            if (category === "美妆") exposure *= 1.85;
            if (category === "数码") exposure *= 0.42;
          }
          // 注入 2：2026-09-10 v28.2 版本的作者回复数下降（互动层，分子下降）
          if (date === "2026-09-10" && app_version === "v28.2") {
            replyRate *= 0.42;
          }
          // 注入 3：2026-09-12 推荐场景出词策略调整，L1 与搜索词点击率下降
          if (date === "2026-09-12" && scene === "推荐") {
            l1Rate *= 0.46;
            ctr *= 0.55;
          }

          const effective_view_users = exposure * viewRate;
          const comments = effective_view_users * commentRate;
          const comment_users = comments * 0.86;
          const author_replies = comments * replyRate;
          const replied_users = author_replies * 0.92;
          const replied_revisit_users = replied_users * 0.31 * jitter(0.04);
          const sw_impressions = effective_view_users * 1.18;
          const sw_clicks = sw_impressions * ctr;
          const l1_search_users = effective_view_users * l1Rate;
          const l2_search_users = effective_view_users * l2Rate;
          const search_users = l1_search_users + l2_search_users;
          const order_users = search_users * convRate;
          const gmv = order_users * aov;

          rows.push({
            date,
            scene,
            category,
            author_tier,
            app_version,
            exposure: Math.round(exposure),
            effective_view_users: Math.round(effective_view_users),
            comments: Math.round(comments),
            comment_users: Math.round(comment_users),
            author_replies: Math.round(author_replies),
            replied_users: Math.round(replied_users),
            replied_revisit_users: Math.round(replied_revisit_users),
            sw_impressions: Math.round(sw_impressions),
            sw_clicks: Math.round(sw_clicks),
            l1_search_users: Math.round(l1_search_users),
            l2_search_users: Math.round(l2_search_users),
            search_users: Math.round(search_users),
            order_users: Math.round(order_users),
            gmv: Math.round(gmv),
          });
        }
      }
    }
  }
}

function csvCell(v) {
  const s = String(v ?? "");
  const needsQuote = s.includes(",") || s.includes('"') || s.includes("\n");
  return needsQuote ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(records) {
  const headers = Object.keys(records[0]);
  const lines = [headers.map(csvCell).join(",")];
  for (const r of records) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  return lines.join("\n");
}

const events = [
  { id: "EV001", date: "2026-08-20", type: "发版", name: "客户端 v28.2 灰度放量", scope_dim: "app_version", scope_value: "v28.2", platform: "Android", ramp: "30%", layer: "跨层", metrics: "全链路", source: "发版记录" },
  { id: "EV002", date: "2026-09-03", type: "运营活动", name: "站内 Push 召回活动", scope_dim: "", scope_value: "", platform: "全端", ramp: "", layer: "内容层", metrics: "I09,M09", source: "活动日历" },
  { id: "EV003", date: "2026-09-05", type: "运营活动", name: "美妆大促资源位放量", scope_dim: "category", scope_value: "美妆", platform: "全端", ramp: "", layer: "交易层", metrics: "M18,M01", source: "活动日历" },
  { id: "EV004", date: "2026-09-09", type: "策略", name: "评论管理改版灰度（作者端）", scope_dim: "app_version", scope_value: "v28.2", platform: "Android", ramp: "30%", layer: "互动层", metrics: "H02,H06", source: "策略变更记录" },
  { id: "EV005", date: "2026-09-11", type: "口径与埋点", name: "互动埋点上报异常", scope_dim: "", scope_value: "", platform: "全端", ramp: "", layer: "跨层", metrics: "全链路", source: "数据侧告警" },
  { id: "EV006", date: "2026-09-12", type: "策略", name: "评论区出词策略调整（收紧出词范围）", scope_dim: "scene", scope_value: "推荐", platform: "全端", ramp: "50%", layer: "搜索层", metrics: "M20,L1,M12", source: "搜索策略记录" },
  { id: "EV007", date: "2026-09-12", type: "运营活动", name: "家居品类内容加热", scope_dim: "category", scope_value: "家居", platform: "全端", ramp: "", layer: "内容层", metrics: "I09", source: "活动日历" },
];

writeFileSync(join(OUT_DIR, "demo-metrics.csv"), toCsv(rows), "utf8");
writeFileSync(join(OUT_DIR, "demo-events.csv"), toCsv(events), "utf8");
console.log("生成明细数据", rows.length, "行 →", join(OUT_DIR, "demo-metrics.csv"));
console.log("生成事件", events.length, "条 →", join(OUT_DIR, "demo-events.csv"));
