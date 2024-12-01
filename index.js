require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const User = require("./Models/userModel");
const Order = require("./Models/orderModel");
const cron = require("node-cron");
const validator = require("email-validator");

const { v4: uuidv4, validate: validateUUID } = require("uuid");

const Port = process.env.PORT || 3000;
const Telegram_Token = process.env.TELEGRAM_API_TOKEN;
const MongoDB_URI = process.env.MONGODB_URI;
const ADMIN_KEY = process.env.ADMIN_KEY;

let PLANS = [
  {
    id: 0,
    plan: "1 Month Subscription",
  },
  {
    id: 1,
    plan: "3 Months Subscription",
  },
  {
    id: 2,
    plan: "6 Months Subscription",
  },
  {
    id: 3,
    plan: "1 Year Subscription",
  },
];

const app = express();
const bot = new TelegramBot(Telegram_Token, { polling: true });

let BOT_WAITING_FOR_RESPONSE = false;

const USERS_STATE = {};

const BUTTONS = ["🔑 Set/Change Api Key", "🔍 Generate Template"];
const TEMPLATES = [
  {
    id: 0,
    name: "Shahid VIP 1 Month",
    description: "شاهد VIP لمدة شهر",
  },
  {
    id: 1,
    name: "Shahid VIP 3 Months",
    description: "اشتراك VIP لمدة 3 اشهر",
  },
  {
    id: 2,
    name: "Shahid VIP 1 Year",
    description: "اشتراك VIP لمدة سنة",
  },
  {
    id: 3,
    name: "Shahid Sport 1 Month",
    description: "اشتراك شاهد رياضية لمدة شهر",
  },
  {
    id: 4,
    name: "Shahid Sport 3 Months",
    description: "اشتراك شاهد رياضية لمدة 3 اشهر",
  },
  {
    id: 5,
    name: "Shahid Sport 1 Year",
    description: "اشتراك شاهد رياضية لمدة سنة",
  },
  {
    id: 6,
    name: "Netflix 1 Month",
    description: "اشتراك نتفليكس شهر",
  },
];

// Connect to MongoDB
mongoose
  .connect(MongoDB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB", err));

app.use(express.json());
app.use(cors());
//azez

app.get("/", (req, res) => {
  res.send("Hello World!");
});

/// TESTING

const commands = [
  { command: "/start", description: "Start the bot and set API key" },
  {
    command: "/generate",
    description: "Search and Check for Membership Status",
  },
  // { command: "/check", description: "Check options" },
  { command: "/help", description: "List all available commands" },
  { command: "/key", description: "Set/Change your API key" },
];

// Handler functions
function handleStartCommand(chatId) {
  //Init User state
  USERS_STATE[chatId] = {};

  // bot.sendMessage(chatId, "Welcome! Please provide your API key:");
  bot.sendMessage(chatId, "Welcome", {
    reply_markup: {
      keyboard: [["🔑 Set/Change Api Key"], ["🔍 Generate Template"]],
      resize_keyboard: true,

      one_time_keyboard: false,
    },
  });

  // userKeys[chatId] = null; // Initialize user key as null
}

// async function handleFreeFireOffersCommand(chatId) {
//   if (!(await isAuthenticated(chatId))) {
//     bot.sendMessage(chatId, "Please provide your API key first.");
//     return;
//   }
// }

async function handleKeyCommand(chatId) {
  if (!(await isAuthenticated(chatId))) {
    bot.sendMessage(chatId, "Please enter your API key:");
    handleUpdateKey(chatId);
  } else {
    const user = await User.findOne({ chatId });
    bot.sendMessage(
      chatId,
      `Your Current Api key is : \n \`${user.apiKey}\` \n Please enter your new Api Key: `,
      {
        parse_mode: "MARKDOWN",
      }
    );
    handleUpdateKey(chatId);
  }
}

function sendAvailableCommands(chatId) {
  const helpMessage = commands
    .map((cmd) => `${cmd.command} - ${cmd.description}`)
    .join("\n");
  bot.sendMessage(chatId, `Available commands:\n${helpMessage}`);
}

async function isAuthenticated(chatId) {
  const user = await User.findOne({ chatId });
  return user !== null;
}

async function handleUpdateKey(chatId) {
  // Set the user's state to wait for API key input
  USERS_STATE[chatId] = { waitingForApiKey: true };

  const onMessage = async (msg) => {
    // Ensure that we only handle the response for the intended user
    if (msg.chat.id === chatId && USERS_STATE[chatId].waitingForApiKey) {
      const apiKey = msg.text;

      if (validateUUID(apiKey)) {
        // ican hard check for apiKey
        try {
          // await axios.get(`${ICH7EN_API_BASE_URL}/profile`, {
          //   headers: {
          //     "api-token": `${apiKey}`,
          //   },
          // });

          // error her admin can't change his api key
          if (apiKey === ADMIN_KEY) {
            await User.findOneAndUpdate(
              { chatId },
              { apiKey },
              { upsert: true, new: true }
            );
            bot.sendMessage(chatId, "API key updated successfully!");
            sendAvailableCommands(chatId);
            // Clear the user's state and remove the listener after success
            USERS_STATE[chatId] = {};
            bot.removeListener("message", onMessage);
          } else {
            throw new Error("wrong API key");
          }
        } catch (err) {
          console.error("Error saving API key:", err.message);
          bot.sendMessage(chatId, "Failed to save API key. Please try again.");
          // No need to remove the listener, user will try again
        }
      } else {
        bot.sendMessage(
          chatId,
          "Invalid API key format. Please enter a valid API key."
        );
        // No need to remove the listener, user will try again
      }
    }
  };

  // Register the listener for this specific user
  bot.on("message", onMessage);
}

async function generateTemplate(chatId, templateId) {
  if (!(await isAuthenticated(chatId))) {
    bot.sendMessage(chatId, "Please provide your API key first.");
    return;
  }
  // Set user state for waiting for player ID
  USERS_STATE[chatId] = { waitingForCombo: true };

  bot.sendMessage(chatId, "ادخل الاميل والباسورد :");

  // Create a function to handle user messages
  const handleMessage = async (msg) => {
    if (BUTTONS.includes(msg.text)) {
      bot.removeListener("message", handleMessage); // Remove the listener
      return;
    }
    if (msg.chat.id !== chatId || !USERS_STATE[chatId]?.waitingForCombo) {
      bot.removeListener("message", handleMessage); // Remove the listener
      return;
    }
    //check if its valid combo

    let combo = msg.text.split(":");
    let email = combo[0];
    let password = combo[1];
    if (!email || !password) {
      bot.sendMessage(chatId, "Invalid Combo");
      return;
    }
    // \n${TEMPLATES[templateId].description}
    // الايميل :    ${email}  \n
    // الباسورد :  ${password} \n
    // الشاشة رقم  ${index + 1} \n
    // الشروط: \n\n
    // ❌ ممنوع ادخال اكثر من جهاز واحد ❌ \n\n
    // - الشاشة لشخص واحد فقط. \n
    // - ممنوع مشاركة المعلومات لتجنب تقطعات المشاهدة. \n\n
    // رابط المتجر: https://max-2u.com/ \n

    if (templateId == 6) {
      let NetflixTemplates = generateNetflixTemplates(email, password);
      NetflixTemplates.map((template) => {
        bot.sendMessage(chatId, template);
      });
    } else {
      // Array.from({ length: 4 }).forEach((_, index) => {
      for (let index = 0; index < 4; index++) {
        bot.sendMessage(
          chatId,
          `\n${TEMPLATES[templateId].description}
    الايميل :    ${email}  \n
    الباسورد :  ${password} \n
    الشاشة رقم  ${index + 1} \n
    الشروط: \n\n
    ❌ ممنوع ادخال اكثر من جهاز واحد ❌ \n\n
    - الشاشة لشخص واحد فقط. \n
    - ممنوع مشاركة المعلومات لتجنب تقطعات المشاهدة. \n
    ${
      templateId >= 3
        ? "- ✅ اذا مالقيت الشاشة سوي اضافة و اكتب اسمك فالشاشة ✅ \n\n"
        : "\n"
    }
    رابط المتجر: https://max-2u.com/ \n
`
        );
      }
    }

    bot.removeListener("message", handleMessage); // Remove the listener
  };

  bot.on("message", handleMessage);
}
async function handleReturnButtons(chatId) {
  if (!(await isAuthenticated(chatId))) {
    bot.sendMessage(chatId, "Please provide your API key first.");
    return;
  }
  const templateButtons = TEMPLATES.map((template) => [
    {
      text: template.name,
      callback_data: `template_select_${template.id}`,
    },
  ]);
  const options = {
    reply_markup: {
      inline_keyboard: [...templateButtons],
    },
  };
  bot.sendMessage(chatId, "Please select template to generate:", options);
}

function generateNetflixTemplates(email, password) {
  return [
    `اشتراك نتفليكس شهر \n 
ملف خاص ✅ \n\n
الايميل :  ${email} \n
الباسورد :  ${password} \n
الشاشة : 1  \n
كود الشاشة : 2230 \n\n
الشروط :  \n
- ممنوع تغيير كلمة المرور ❌ \n
- ممنوع استخدام الحساب في جهازين مختلفين في نفس الوقت \n\n ❌
نتمنى منكم احترام الشروط لمشاهدة ممتعة \n ♥️
رابط المتجر: https://max-2u.com/
`,
    `اشتراك نتفليكس شهر \n 
ملف خاص ✅ \n\n
الايميل :  ${email} \n
الباسورد :  ${password} \n
الشاشة : 2  \n
كود الشاشة : 3550 \n\n
الشروط :  \n
- ممنوع تغيير كلمة المرور ❌ \n
- ممنوع استخدام الحساب في جهازين مختلفين في نفس الوقت \n\n ❌
نتمنى منكم احترام الشروط لمشاهدة ممتعة \n ♥️
رابط المتجر: https://max-2u.com/
`,
    `اشتراك نتفليكس شهر \n 
ملف خاص ✅ \n\n
الايميل :  ${email} \n
الباسورد :  ${password} \n
الشاشة : 3  \n
كود الشاشة : 5660 \n\n
الشروط :  \n
- ممنوع تغيير كلمة المرور ❌ \n
- ممنوع استخدام الحساب في جهازين مختلفين في نفس الوقت \n\n ❌
نتمنى منكم احترام الشروط لمشاهدة ممتعة \n ♥️
رابط المتجر: https://max-2u.com/
`,
    `اشتراك نتفليكس شهر \n 
ملف خاص ✅ \n\n
الايميل :  ${email} \n
الباسورد :  ${password} \n
الشاشة : 4  \n
كود الشاشة : 7440 \n\n
الشروط :  \n
- ممنوع تغيير كلمة المرور ❌ \n
- ممنوع استخدام الحساب في جهازين مختلفين في نفس الوقت \n\n ❌
نتمنى منكم احترام الشروط لمشاهدة ممتعة \n ♥️
رابط المتجر: https://max-2u.com/
`,
    `اشتراك نتفليكس شهر \n 
ملف خاص ✅ \n\n
الايميل :  ${email} \n
الباسورد :  ${password} \n
الشاشة : 5  \n
كود الشاشة : 2003 \n\n
الشروط :  \n
- ممنوع تغيير كلمة المرور ❌ \n
- ممنوع استخدام الحساب في جهازين مختلفين في نفس الوقت \n\n ❌
نتمنى منكم احترام الشروط لمشاهدة ممتعة \n ♥️
رابط المتجر: https://max-2u.com/
`,
  ];
}
// Command handlers
bot.onText(/\/start/, (msg) => {
  // BOT_WAITING_FOR_RESPONSE = false;
  handleStartCommand(msg.chat.id);
});

bot.onText(/\/search/, (msg) => {
  // BOT_WAITING_FOR_RESPONSE = false;
  const chatId = msg.chat.id;
  USERS_STATE[chatId] = {};
  generateTemplate(chatId);
});

bot.onText(/\/help/, (msg) => {
  // BOT_WAITING_FOR_RESPONSE = false;
  const chatId = msg.chat.id;
  USERS_STATE[chatId] = {};
  const helpMessage = commands
    .map((cmd) => `${cmd.command} - ${cmd.description}`)
    .join("\n");
  bot.sendMessage(chatId, helpMessage);
});

bot.onText(/\/key/, async (msg) => {
  // BOT_WAITING_FOR_RESPONSE = false;
  const chatId = msg.chat.id;
  USERS_STATE[chatId] = {};

  handleKeyCommand(chatId);
});

// Callback query handler
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data.split("_");
  const command = data[0];
  const action = data[1];
  const id = data[2];

  switch (command) {
    case "template":
      if (action === "select") {
        if (Object.keys(USERS_STATE[chatId]).length > 0) return;
        generateTemplate(chatId, id);
      }
      break;
    default:
      bot.sendMessage(chatId, "Invalid selection.");
      break;
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.text.startsWith("/")) {
    if (msg.text.indexOf("🔍 Generate Template") === 0) {
      // BOT_WAITING_FOR_RESPONSE = false;
      USERS_STATE[chatId] = {};

      handleReturnButtons(chatId);

      return;
    }
    ///
    if (msg.text.indexOf("🔑 Set/Change Api Key") === 0) {
      // BOT_WAITING_FOR_RESPONSE = false;
      USERS_STATE[chatId] = {};
      handleKeyCommand(chatId);
    }
  }
});

///THIS IS ADDED TO PREVENT RENDER FROM SPINNING OFF
function reloadWebsite() {
  const url = `https://ferhat-bot.onrender.com`; // Replace with your Render URL
  const interval = 30000; // Interval in milliseconds (30 seconds)
  axios
    .get(url)
    .then((response) => {
      console.log(
        `Reloaded at ${new Date().toISOString()}: Status Code ${
          response.status
        }`
      );
    })
    .catch((error) => {
      console.error(
        `Error reloading at ${new Date().toISOString()}:`,
        error.message
      );
    });
}

cron.schedule("* * * * *", () => {
  reloadWebsite();
});

app.listen(Port, () => {
  console.log(`App listening on port ${Port}`);
});
