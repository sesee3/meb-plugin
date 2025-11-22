const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { encrypt, decrypt, generateToken } = require("./crypt");

const TelegramBot = require('node-telegram-bot-api');
const { text } = require("stream/consumers");

const token = '7765586440:AAHd0k1_FdZ1wTV9Dc_7eVj6zfEFkuHkWJ0';
const bot = new TelegramBot(token, { polling: true });

const telegram_users_file = path.join(__dirname, 'telegram_users.json');

let app = null; //SIGNALK APP DATAs
const livePositionIntervals = new Map();


function loadUsers() {
    if (!fs.existsSync(telegram_users_file)) {
        return [];
    }
    const data = fs.readFileSync(telegram_users_file);
    return decrypt(data);
}

function saveUsers(users) {
    const buffer = encrypt(users);
    fs.writeFileSync(telegram_users_file, buffer);
}

function login(token, chatID) {
    const users = loadUsers();
    const userIDX = users.findIndex(u => u.token === token);
    if (userIDX === -1) {
        throw new Error("Token non valido");
    }

    users[userIDX].hasLogged = true;
    users[userIDX].chatID = chatID;
    saveUsers(users);
    return users[userIDX];
}

function logout(chatID) {
    const users = loadUsers();
    const userIDX = users.findIndex(u => u.chatID === chatID);
    if (userIDX === -1) {
        throw new Error("Token non valido");
    }

    users[userIDX].hasLogged = false;
    users[userIDX].chatID = null;
    saveUsers(users);
    return users[userIDX];
}

function getUserWith(token) {
    const users = loadUsers();
    return users.find(u => u.token === token);
}

async function linkBot(appInstance) {
    app = appInstance;
    return bot;
}

//
bot.onText(/\/ask/, (msg) => {
    const chatId = msg.chat.id;

    const inlineKeyboard = {
       inline_keyboard: [
         [
            { text: "Posizione", callback_data: "position" },
        ],
        [
            { text: "Batteria", callback_data: "battery" },
        ],
        [
            { text: "Previsioni Metereologiche", callback_data: "forecast_predictions" },
        ],
        [
            { text: "Venti", callback_data: "winds" },
        ],
        [
            { text: "Onde", callback_data: "waves" },
        ],
        [
            { text: "Profondità", callback_data: "depth" },
        ],
        [
            { text: "❌ Annulla", callback_data: "revert_query" },
        ]
       ]
    }



    bot.sendMessage(chatId, "Seleziona un'opzione:", {
        reply_markup: inlineKeyboard,
    });

});

//Gestione delle risposte ai pulsanti dei menu
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    switch (data) {
        //Ottieni informazioni sulla posizione della
        case 'position': {
            bot.answerCallbackQuery(query.id, { text: "Recupero posizione..." });
            bot.editMessageText("Posizione: ..........", {
                chat_id: chatId,
                message_id: query.message.message_id,
            });
            break;
        }
        case 'revert_query': {
            bot.sendMessage(chatId, "Operazione annullata.");
            break;
        }
        default:
            bot.sendMessage(chatId, "Funzionalità non ancora implementata.");
            break;
    };
});

//Avvia una trasmissione live dei dati <DA VEDERE SE UTILE>
bot.onText(/\/ask_live/, async (msg) => {
    const chatId = msg.chat.id;

    if (livePositionIntervals.has(chatId)) {
        bot.sendMessage(chatId, "La trasmissione della posizione è già attiva.");
        return;
    }

    const pos = getCurrentPosition();
    if (!pos) {
        bot.sendMessage(chatId, "Posizione non disponibile.");
        return;
    }

    const text = `Posizione attuale:\nLatitudine: ${pos.latitude}\nLongitudine: ${pos.longitude}`;
    const sent = await bot.sendMessage(chatId, text);
    const messageID = sent.message_id;

     const intervalId = setInterval(() => {
    const p = getCurrentPosition();
    if (!p) return;
    const text =
      `Aggiornamenti posizione - 5s:\n` +
      `Latitudine=${p.latitude.toFixed(6)}\n` +
      `Longitudine=${p.longitude.toFixed(6)}\n` +
      `Usa /pos_stop per fermare.`;

    bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageID,
    }).catch(() => {}); 

  }, 5000 // 5 secondi
  );

  livePositionIntervals.set(chatId, intervalId);
});

//Interrompe le iscrizioni alla trasmissione dei dati <DA VEDERE SE UTILE>
bot.onText(/\/stop/, (msg) => {
    const chatId = msg.chat.id;
    const intervalId = livePositionIntervals.get(chatId);
    if (!intervalId) {
        bot.sendMessage(chatId, "Nessuna trasmissione della posizione attiva.");
        return;
    }
    clearInterval(intervalId);
    livePositionIntervals.delete(chatId);
    bot.unpinChatMessage(chatId).catch(() => {});
});

function getCurrentPosition() {
    if (!app) {
        return null;
    }

    const position = app.getSelfPath('navigation.position');
    if (!position) {
        return null;
    }

    return {
        latitude: position.value.latitude,
        longitude: position.value.longitude,
    };
}


//TEMP:
function upsertUserByChatId(chatId) {
  const users = loadUsers();
  let user = users.find(u => u.chatId === chatId);
  if (!user) {
    user = { token: generateToken(), hasLogged: false, chatId };
    users.push(user);
  }
  saveUsers(users);
  return user;
}

bot.onText(/\/override_login/, (msg) => {
  const chatId = msg.chat.id;
  try {
    const user = upsertUserByChatId(chatId);
    bot.sendMessage(
      chatId,
      `Benvenuto! Il bot MEB è attivo.\nIl tuo token è:\n${user.token}\nConservalo.`
    );
  } catch (err) {
    console.error("Errore /start:", err);
    bot.sendMessage(chatId, "Errore interno durante la registrazione.");
  }
});

//LOGIN / SECURITY

bot.onText(/\/login\s+(.+)/, (msg, match) => {
    const chatID = msg.chat.id;
    const token = (match && match[1] || "").trim();

    if (!token) {
        bot.sendMessage(chatID, "Inserisci il tuo token di accesso.");
        return;
    }

    try {
        const user = login(token, chatID);
        if (!user) {
            bot.sendMessage(chatID, "Token non valido o rimosso.");
            return;
        }

        bot.sendMessage(chatID, "Login effettuato.");
        bot.setMyCommands(other_commands);
    } catch (error) {
        console.log(error);
        bot.sendMessage(chatID, `Errore durante il login: ${error}`);
    }
});

bot.onText(/\/logout/, (msg) => {
    const chatID = msg.chat.id;
    
    try {
        const user = logout(chatID);
        if (!user) {
            bot.sendMessage(chatID, "Utente non trovato o non loggato.");
            return;
        }
        bot.sendMessage(chatID, "Logout effettuato.");
        bot.setMyCommands(basic_commands);
    } catch (error) {
        bot.sendMessage(chatID, `Errore durante il logout: ${error}`);
    }
});


async function sendToBot(filePath) {
    const form = new FormData();

    form.append(`chat_id`, CHAT_ID);
    form.append(`caption`, `${path.basename(filePath)}, ${new Date().toLocaleDateString()}`);
    form.append(`document`, fs.createReadStream(filePath));

    try {
        console.log(`Invio del file ${filePath} al bot Telegram...`);
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        console.log(`File inviato con successo: ${response.data.ok}`);

    } catch (error) {
        console.error(`Errore durante l'invio del file: ${error.message}`);
    }
}

async function processAndSendFile(filePath) {
    try {
        const zippedFilePath = await zipFile(filePath);
        await sendToBot(zippedFilePath);
        fs.unlinkSync(zippedFilePath);
        fs.unlinkSync(filePath);
    } catch (error) {
        console.error(`Errore nel processo di compressione e invio: ${error.message}`);
    }
}

const basic_commands = [
    { command: 'login', description: "Accedi con il token di accesso per accedere alle funzionalità." },
    { command: 'logout', description: "Elimina il token e effettua il logout" },
];

const other_commands = [
    {
        command: 'latest',
        description: 'Ottieni l\'ultimo pacchetto di dati registrati dalla barca'
    },
    {
        command: 'remove',
        description: 'Rimuovi un pacchetto di dati dalla memoria del computer di bordo'
    },
    {
        command: 'clear',
        description: 'Rimuovi tutti i pacchetti di dati memorizzati dal computer di bordo'
    },
    {
        command: 'ask',
        description: 'Ottieni dati e informazioni sullo stato della barca'
    },
    {
        command: 'ask_live',
        description: 'Richiedi informazioni sulla barca in tempo reale'
    },
    {
        command: 'stop',
        description: 'Interrompi la trasmissione in tempo reale dei dati della barca'
    }
];



module.exports = {
    linkBot
};