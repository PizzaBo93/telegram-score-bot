import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ✅ Parse command /score
function parseScoreCommand(text) {
  const clean = text.replace("/score", "").trim();
  const tokens = clean.split(/\s+/);

  let users = [];
  let point = null;
  let note = "";

  // 👉 tìm vị trí điểm
  const pointIndex = tokens.findIndex(t => /^[+-]?\d+$/.test(t));

  if (pointIndex === -1) {
    return { users: [], point: null, note: "" };
  }

  point = parseInt(tokens[pointIndex]);

  // 👉 user = trước điểm
  users = tokens
    .slice(0, pointIndex)
    .map(t => t.replace("@", "").toLowerCase());

  // 👉 note = sau điểm
  note = tokens.slice(pointIndex + 1).join(" ");

  return { users, point, note };
}

// ✅ gửi message Telegram
async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(200).send("ok");

    const msg = req.body?.message;
    if (!msg?.text) return res.status(200).send("no message");

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // 👉 chỉ xử lý /score
    if (!text.startsWith("/score")) {
      return res.status(200).send("ignore");
    }

    const { users, point, note } = parseScoreCommand(text);

    if (!users.length || point === null) {
      await sendMessage(chatId, "❌ Sai cú pháp: /score tien -5 đi trễ");
      return res.status(200).send("invalid");
    }

    let results = [];

    for (let username of users) {
      // 👉 tìm user (không phân biệt hoa thường)
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .ilike("username", username)
        .single();

      if (error || !user) {
        results.push(`❌ Không có ${username}`);
        continue;
      }

      // 👉 insert log
      await supabase.from("staff_score_logs").insert({
        user_id: user.id,
        point,
        note
      });

      // 👉 tính tổng (basic version)
      const { data: logs } = await supabase
        .from("staff_score_logs")
        .select("point")
        .eq("user_id", user.id);

      const total = 100 + (logs?.reduce((a, b) => a + b.point, 0) || 0);

      results.push(
        `✅ ${user.display_name}: ${point > 0 ? "+" : ""}${point} → ${total} điểm`
      );
    }

    await sendMessage(chatId, results.join("\n"));

    return res.status(200).send("ok");

  } catch (err) {
    console.error("ERROR:", err);
    return res.status(500).send("error");
  }
}
