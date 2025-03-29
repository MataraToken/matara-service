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
        // if (photos.total_count > 0) {
        //   const fileId = photos.photos[0][0].file_id;
        //   const file = await bot.telegram.getFile(fileId);
        //   const profilePictureUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        //   console.log("Profile Picture URL:", profilePictureUrl); // Add this line
        //   return profilePictureUrl;
        // }
        // return null;
    }
    catch (error) {
        console.error("Error getting profile photo:", error);
        return null;
    }
};
// Start command
bot.start(async (ctx) => {
    const referralCode = ctx.payload;
    const username = ctx.from.username;
    const profilePicture = await getProfilePicture(ctx.from.id);
    const imageUrl = "https://res.cloudinary.com/wallnet/image/upload/v1726351913/bannerflow_pnnugl.png";
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
            });
            if (res.status === 200 || res.status === 201) {
                ctx.replyWithPhoto({ url: imageUrl }, {
                    caption: `Welcome to Sunflower Brawl Bot 🌻, @${ctx.from.username}! \nSunflower Brawl is Tap to Earn game, earn in-game currency, and eventually receive a real token that will have value on the exchange.`,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                telegraf_1.Markup.button.url("Join community", `https://t.me/sunflower_coin`),
                            ],
                            [
                                telegraf_1.Markup.button.url("Sunflower on X", "https://www.x.com/Sunflower_Coin"),
                            ],
                            // [
                            //   Markup.button.webApp(
                            //     "Test Brawl now!",
                            //     `https://23d8-102-90-65-72.ngrok-free.app`
                            //   ),
                            // ],
                            [
                                telegraf_1.Markup.button.webApp("Brawl now!", `https://sunflowercoin.xyz/`),
                            ],
                        ],
                    },
                });
            }
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