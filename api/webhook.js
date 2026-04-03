import { supabase } from "../lib/supabase";

function parseMessage(text) {
  const tokens = text.trim().split(/\s+/);

  let users = [];
  let point = null;
  let note = [];

  for (let t of tokens) {
    if (t.startsWith("@")) {
      users.push(t.replace("@", ""));
    } else if (/^[+-]?\d+$/.test(t)) {
      point = parseInt(t);
    } else {
      note.push(t);
    }
  }

  return {
    users,
    point,
    note: note.join(" ")
  };
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
    const { users, point, note } = parseMessage(text);

    if (!users.length || point === null) {
      await sendMessage(chatId, "❌ Sai cú pháp. Ví dụ: @tien -5 đi trễ");
      return res.status(200).send("invalid");
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

      // insert log
      await supabase.from("staff_score_logs").insert({
        user_id: user.id,
        point,
        note
      });

      // tính tổng điểm
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

    res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    await sendMessage(chatId, "❌ Lỗi hệ thống");
    res.status(200).send("error");
  }
}
