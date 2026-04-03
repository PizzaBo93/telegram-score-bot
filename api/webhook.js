import { supabase } from "../lib/supabase";

const RULE_ALIAS = {
  DT: "DI_TRE",
  BC: "BANH_CHAY",
  KK: "KHACH_KHEN",
  VS: "VS_KHONG_SACH"
};

function parseMessage(text) {
  const [main, notePart] = text.split("|");
  const note = notePart?.trim();

  const tokens = main.trim().split(/\s+/);

  let users = [];
  let action = null;
  let ruleCode = null;
  let overridePoint = null;

  for (let t of tokens) {
    if (t.startsWith("@")) users.push(t.replace("@", ""));
    else if (t === "+" || t === "-") action = t;
    else if (/^[+-]?\d+$/.test(t)) overridePoint = parseInt(t);
    else ruleCode = RULE_ALIAS[t] || t;
  }

  return { users, action, ruleCode, overridePoint, note };
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");

  const msg = req.body.message;
  if (!msg || !msg.text) return res.status(200).send("no message");

  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text.includes("@")) return res.status(200).send("ignore");

  try {
    const { users, action, ruleCode, overridePoint, note } = parseMessage(text);

    if (!users.length || !ruleCode) return res.status(200).send("invalid");

    const { data: rule } = await supabase
      .from("score_rules")
      .select("*")
      .eq("code", ruleCode)
      .single();

    if (!rule) {
      await sendMessage(chatId, `❌ Không tìm thấy lỗi: ${ruleCode}`);
      return res.status(200).send("ok");
    }

    let results = [];

    for (let username of users) {
      const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .single();

      if (!user) {
        results.push(`❌ Không có @${username}`);
        continue;
      }

      let point = overridePoint ?? rule.default_point;

      if (action === "-" && point > 0) point = -point;
      if (action === "+" && point < 0) point = Math.abs(point);

      await supabase.from("staff_score_logs").insert({
        user_id: user.id,
        rule_id: rule.id,
        point,
        note
      });

      const { data: logs } = await supabase
        .from("staff_score_logs")
        .select("point")
        .eq("user_id", user.id);

      const total = 100 + logs.reduce((a, b) => a + b.point, 0);

      results.push(
        `✅ ${user.display_name} ${point > 0 ? "+" : ""}${point} → ${total} điểm`
      );
    }

    await sendMessage(chatId, results.join("\n"));

    res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    await sendMessage(chatId, "❌ Lỗi xử lý");
    res.status(200).send("error");
  }
}