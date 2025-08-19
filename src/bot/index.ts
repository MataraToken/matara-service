


import { Telegraf, Markup } from "telegraf";
import axios from "axios";

const token = process.env.TELEGRAM_BOT_TOKEN;
const serverUrl = process.env.SERVER_URL;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

if (!serverUrl) {
  throw new Error("SERVER_URL is required");
}

const bot = new Telegraf(token);

const getProfilePicture = async (userId: number) => {
  try {
    const photosResponse = await axios.get(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos`,
      {
        params: {
          user_id: userId,
        },
      }
    );

    if (photosResponse.data.result.total_count === 0) {
      return null;
    }

    if (photosResponse.data.ok && photosResponse.data.result.total_count > 0) {
      const fileId = photosResponse.data.result.photos[0][0].file_id;

      // Step 2: Get File Information
      const fileResponse = await axios.get(
        `https://api.telegram.org/bot${token}/getFile`,
        {
          params: {
            file_id: fileId,
          },
        }
      );

      if (fileResponse.data.ok) {
        const filePath = fileResponse.data.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
        return fileUrl;
      }
    }
  } catch (error) {
    console.error("Error getting profile photo:", error);
    return null;
  }
  return null;
};

// Error handler middleware
bot.catch((err, ctx) => {
  console.error(`Bot error for ${ctx.updateType}:`, err);
});

// Start command
bot.start(async (ctx) => {
  try { 
    console.log("User started bot:", ctx.from);
    
    const referralCode = ctx.payload || "";
    const firstName = ctx.from?.first_name || "";
    const username = ctx.from?.username;
    
    if (!username) {
      return ctx.reply(
        "Please set a username in your Telegram account settings to proceed."
      );
    }

    const profilePicture = await getProfilePicture(ctx.from.id);
    
    // Use your actual web app URL here instead of ngrok
    const weburl = process.env.WEB_APP_URL || "https://matara-tma.vercel.app/";
    // const weburl =  "https://jurstadev.xyz/";
    const imageUrl =
      "https://res.cloudinary.com/wallnet/image/upload/t_new-mat/v1743246776/MATARA_kqx0kj.png";

    console.log(`Registering user: ${username}`);

    const res = await axios.post(`${serverUrl}/api/user/register`, {
      username,
      referralCode,
      profilePicture,
      firstName,
    });

    if (res.status === 200 || res.status === 201) {
      await ctx.replyWithPhoto(
        { url: imageUrl },
        {
          caption: `🌟 Welcome to Matara! 🚀 @${username} \nMatara is more than just a cryptocurrency—it's a movement! Built on blockchain technology, Matara helps you discover your true essence and live with purpose. 🌍✨ \n\n🔹 Send & receive Matara seamlessly\n🔹 Stake Matara \n🔹 Stay updated on community events\n🔹 Join a purpose-driven network \n\nTap Get Started below and begin your journey with Matara today! 🔥👇`,
          reply_markup: {
            inline_keyboard: [
              [
                Markup.button.webApp(
                  "Start now!",
                  `${weburl}`
                ),
              ],
              [
                Markup.button.url(
                  "Join community",
                  `https://t.me/FTLDOfficial`
                ),
              ],
            ],
          },
        }
      );
      console.log(`Successfully registered and sent welcome message to ${username}`);
    }
  } catch (error) {
    console.error("Error in start command:", error);
    
    // Send a fallback message if registration fails
    try {
      await ctx.reply(
        "Welcome to Matara! There was a temporary issue, but you can still proceed. Please try again in a moment."
      );
    } catch (replyError) {
      console.error("Error sending fallback message:", replyError);
    }
  }
});

// Handle button clicks (though these won't be triggered with webApp buttons)
bot.action("start_now", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('You clicked "Start now!"');
  } catch (error) {
    console.error("Error handling start_now action:", error);
  }
});

bot.action("join_community", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('You clicked "Join community"');
  } catch (error) {
    console.error("Error handling join_community action:", error);
  }
});

bot.action("help", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('You clicked "Help"');
  } catch (error) {
    console.error("Error handling help action:", error);
  }
});

// Help command
bot.help((ctx) => {
  ctx.reply("Need help? Contact our support team or visit our community channel.");
});

// Handle any text message (optional)
bot.on("text", (ctx) => {
  console.log(`Received message from ${ctx.from?.username}: ${ctx.message.text}`);
  // You can add custom text handling here if needed
});

// Don't call bot.launch() or setup signal handlers here
// That will be handled in index.ts

export default bot;