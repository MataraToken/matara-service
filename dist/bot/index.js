"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const token = process.env.TELEGRAM_BOT_TOKEN;
const serverUrl = process.env.SERVER_URL;
const bot = new telegraf_1.Telegraf(token);
const axios_1 = __importDefault(require("axios"));
const getProfilePicture = async (userId) => {
    try {
        // const photos = await bot.telegram.getUserProfilePhotos(userId);
        const photosResponse = await axios_1.default.get(`https://api.telegram.org/bot${token}/getUserProfilePhotos`, {
            params: {
                user_id: userId,
            },
        });
        if (photosResponse.data.result.total_count === 0) {
            return null;
        }
        if (photosResponse.data.ok && photosResponse.data.result.total_count > 0) {
            const fileId = photosResponse.data.result.photos[0][0].file_id;
            // Step 2: Get File Information
            const fileResponse = await axios_1.default.get(`https://api.telegram.org/bot${token}/getFile`, {
                params: {
                    file_id: fileId,
                },
            });
            if (fileResponse.data.ok) {
                const filePath = fileResponse.data.result.file_path;
                // Step 3: Construct the Download URL
                const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
                return fileUrl;
            }
        }
    }
    catch (error) {
        console.error("Error getting profile photo:", error);
        return null;
    }
};
// Start command
bot.start(async (ctx) => {
    console.log(ctx.from);
    const referralCode = ctx.payload;
    const firstName = ctx.from.first_name;
    const username = ctx.from.username;
    const profilePicture = await getProfilePicture(ctx.from.id);
    const weburl = "https://6933d99f3b9a.ngrok-free.app";
    const imageUrl = "https://res.cloudinary.com/wallnet/image/upload/t_new-mat/v1743246776/MATARA_kqx0kj.png";
    console.log(username, "username");
    if (!username) {
        return ctx.reply("Please set a username in your Telegram account settings to proceed.");
    }
    else {
        try {
            const res = await axios_1.default.post(`${serverUrl}/api/user/register`, {
                username,
                referralCode,
                profilePicture,
                firstName,
            });
            if (res.status === 200 || res.status === 201) {
                ctx.replyWithPhoto({ url: imageUrl }, {
                    caption: `🌟 Welcome to Matara! 🚀 @${ctx.from.username} \nMatara is more than just a cryptocurrency—it’s a movement! Built on blockchain technology, Matara helps you discover your true essence and live with purpose. 🌍✨ \n\n
🔹 Send & receive Matara seamlessly
🔹 Stake Matara 
🔹 Stay updated on community events
🔹 Join a purpose-driven network \n\n
Tap Get Started below and begin your journey with Matara today! 🔥👇`,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                telegraf_1.Markup.button.webApp("Start now!", `${weburl}/start?username=${ctx.from.username}&referralCode=${referralCode}`),
                            ],
                            [
                                telegraf_1.Markup.button.url("Join community", `https://t.me/FTLDOfficial`),
                            ],
                        ],
                    },
                });
            }
            console.log("web url");
        }
        catch (error) {
            console.log("Error registering user:", error);
            // ctx.reply("Internal server error");
        }
        console.log("started");
    }
});
// Handle button clicks
bot.action("start_now", (ctx) => ctx.reply('You clicked "Start now!"'));
bot.action("join_community", (ctx) => ctx.reply('You clicked "Join community"'));
bot.action("help", (ctx) => ctx.reply('You clicked "Help"'));
// Launch the bot
// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
exports.default = bot;
//# sourceMappingURL=index.js.map