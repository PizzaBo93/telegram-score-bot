import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function parseScoreCommand(text) {
  const clean = text.replace("/score", "").trim();
  const tokens = clean.split(/\s+/);

  let users = [];
  let point = null;
  let note = [];

  for (let t of tokens) {
    // 👉 detect point
    if (/^[+-]?\d+$/.test(t)) {
      point = parseInt(t);
    }
    // 👉 trước khi gặp point = username
    else if (point === null) {
      users.push(t.replace("@", "").toLowerCase());
    }
    // 👉 sau point = note
    else {
      note.push(t);
    }
  }

  return { users, point, note: note.join(" ") };
}

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
      // 👉 tìm user theo username DB
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
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

      // 👉 tính tổng (version đơn giản)
      const { data: logs } = await supabase
        .from("staff_score_logs")
        .select("point")
        .eq("user_id", user.id);

      const total = 100 + logs.reduce((a, b) => a + b.point, 0);

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
