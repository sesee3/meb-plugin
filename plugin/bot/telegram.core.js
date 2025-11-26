const fs = require("fs");
const path = require("path");
const { encrypt, decrypt, generateToken, encryptLog, decryptLog } = require("../tools/crypt");

const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const telegram_users_file = path.join(__dirname, "..", "telegram_users.json");

const filesPerPage = 8;

let app = null;

const livePositionIntervals = new Map(); // Mappa per tracciare gli intervalli di aggiornamento della posizione

const userCommands = new Map(); //Una mappa dei comandi che l'utente esegue

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

function fetchFiles(chatId, page = 0) {
    const logDirectory = path.join(__dirname, "..", "datasetModels/saved_datas");

    try {
        const items = fs.readdirSync(logDirectory);

        const files = items.filter(item => {
            const fullPath = path.join(logDirectory, item);
            return fs.statSync(fullPath).isFile();
        });

        if (files.length === 0) {
            bot.sendMessage(chatId, "📂 Non ci sono log salvati.");
            return;
        }

        const sortedFiles = files
            .map(file => ({
                name: file,
                time: fs.statSync(path.join(logDirectory, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time)
            .map(file => file.name);


        // Calcolo paginazione
        const totalPages = Math.ceil(sortedFiles.length / filesPerPage);
        let currentPage = page;
        if (currentPage < 0) currentPage = 0;
        if (currentPage > totalPages - 1) currentPage = totalPages - 1;

        const startIdx = currentPage * filesPerPage;
        const endIdx = startIdx + filesPerPage;
        const pageFiles = sortedFiles.slice(startIdx, endIdx);

        const fileButtons = pageFiles.map(file => [
            {
                text: `📄 ${file}`,
                callback_data: `request_file_${file}`
            }
        ]);

        // Aggiungi bottoni di navigazione
        const navigationButtons = [];

        if (totalPages > 1) {
            const navRow = [];

            // Bottone "Precedente"
            if (currentPage > 0) {
                navRow.push({
                    text: "←",
                    callback_data: `page_${currentPage - 1}`
                });
            }

            // Indicatore pagina
            navRow.push({
                text: `📖 ${currentPage + 1}/${totalPages}`,
                callback_data: `page_info`
            });

            // Bottone "Successivo"
            if (currentPage < totalPages - 1) {
                navRow.push({
                    text: "→",
                    callback_data: `page_${currentPage + 1}`
                });
            }

            navigationButtons.push(navRow);
        }

        // Bottone annulla
        navigationButtons.push([
            { text: "Annulla", callback_data: "dismiss" }
        ]);

        const inlineKeyboard = {
            inline_keyboard: [...fileButtons, ...navigationButtons]
        };

        bot.sendMessage(chatId, `📥 *Logs di Bordo* \nOgni file corrisponde ad una *sessione*, all'interno del quale sono raccolti valori come la temperature delle batterie o la velocità dei venti. Selezionando un file potrai scaricarlo per visualizzarne i dati. Ogni file è *criptato* per mantenere al sicuro le informazioni sull'imbarcazione. Selezionato un file dal menu, ti verrà inviato e potrai scaricarlo. Assieme al file riceverai una codice che ti permetterà di accedere ai dati. \n⚠️ Per ragioni di sicurezza, avrai solo *10 secondi* prima che il file e il codice verranno eliminati da questa chat e protetti nuovaemtne. Se non avrai scaricato il file e salvato il codice non potrai più richiedere di scaricare lo stesso file per un giorno e l'attività verrà registarta nei log di sicurezza.`,
            {
                parse_mode: 'Markdown',
                reply_markup: inlineKeyboard
            }
        );

    } catch (error) {
        bot.sendMessage(chatId, `Errore lettura directory: ${error.message}`);
    }
}

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

/**
 * Invia un messaggio a tutti gli utenti loggati
 * @param {string} message - Il messaggio da inviare
 * @param {Object} options - Opzioni aggiuntive per sendMessage (opzionale)
 * @returns {Promise<Array>} Array di risultati per ogni invio
 */
async function send(message) {
    const users = loadUsers();
    const loggedUsers = users.filter(u => u.hasLogged && u.chatID);

    for (const user of loggedUsers) {
        try {
            await bot.sendMessage(user.chatID, message);
        } catch (error) {
            console.error(`Send error to ${user.chatID}:`, error.message);
        }
    }
}


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    if (isAuthenticated(chatId)) {

        const menu = {
            keyboard: [
                [
                    { text: "Parametri di Bordo" },
                ],
                [
                    { text: "Logs" },
                ],
                [
                    { text: "Impostazioni" },
                ]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }

        bot.sendMessage(chatId, "Benvenuto nel Data Console. Ecco cosa potrai fare: \n- Visualizzare i dati del computer di bordo\n- Ricevere aggiornamenti su parametri a scelta\n- Scaricare i file di log della barca", {
            parse_mode: 'Markdown',
            reply_markup: menu
        });
        return;
    } else {

        bot.sendMessage(chatId, "Benvenuto nel MEB Data Console!\nQuesto bot consente di visualizzare i dati del computer di bordo, ricevere aggiornamenti su parametri a scelta e scaricare i file di log della barca.", {
            parse_mode: 'Markdown'
        });

        const loginChoices = {
            inline_keyboard: [
                [
                    { text: "❓ Come ottengo un token di accesso", callback_data: "token_login_question" }
                ],
                [
                    { text: "🔑 Ho un token di accesso", callback_data: "token_ready" }
                ],
            ]
        }

        bot.sendMessage(chatId, "👤 Login. \nPer accedere ai dati è necessario un token di accesso. ", {
            reply_markup: loginChoices,
            parse_mode: 'Markdown'
        });
    }
});

bot.onText(/Logs/, (msg) => {
    const chatId = msg.chat.id;
    fetchFiles(chatId, 0);
});

bot.onText(/Parametri di Bordo/, (msg) => {

    const chatId = msg.chat.id;

    let menu = {
        inline_keyboard: [
            [
                { text: " ⛅️ Previsioni Meteo", callback_data: "get_forecasts" }
            ],
            [
                { text: "📍 Posizione", callback_data: "get_position" }
            ],
            [
                { text: "🌬️ Vento", callback_data: "get_wind" }
            ],
            [
                { text: "🌊 Onde", callback_data: "get_waves" }
            ],
            [
                { text: "🔋 Batterie", callback_data: "get_batteries" }
            ],
            [
                { text: "Annulla", callback_data: "dismiss" }
            ]
        ]
    }

    if (isAuthenticated(chatId)) {
        bot.sendMessage(chatId, "⛵️ *Parametri di Bordo*: \nQui potrai visualizzare i parametri attuali del computer di bordo. Scegli il parametro che vuoi visualizzare dal menu qui sotto.", {
            parse_mode: 'Markdown',
            reply_markup: menu
        });
    } else {
        bot.sendMessage(chatId, "Effettua il login utilizzando il comando /login seguito dal tuo token di accesso.");
    }

});

// BOT COMMAND LISTENER --------- USER AUTHENTICATION
bot.onText(/\/login\s+(.+)/, (msg, match) => {
    const chatID = msg.chat.id;
    const token = (match && match[1] || "").trim();

    if (!token) {
        bot.sendMessage(chatID, "Inserisci il token di accesso che ti è stato fornito.");
        return;
    }

    try {
        const user = login(token, chatID);
        if (!user) {
            bot.sendMessage(chatID, "Token non valido o rimosso.");
            return;
        }

        bot.sendMessage(chatID, "Login effettuato.");
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

bot.onText(/\/override_login/, (msg) => {
    const chatId = msg.chat.id;
    try {
        const user = upsertUserByChatId(chatId);
        bot.sendMessage(
            chatId,
            `Nuovo pre-token generato \n${user.token}\n.`
        );
    } catch (err) {
        bot.sendMessage(chatId, "Non è stato possibile generare il pre-token.");
    }
});

// ==================== LOG FILE COMMANDS ====================

bot.onText(/\/log_status/, (msg) => {
    const chatId = msg.chat.id;

    if (!isAuthenticated(chatId)) {
        bot.sendMessage(chatId, "⚠️ Effettua il login per visualizzare lo stato dei log.");
        return;
    }

    try {
        if (!app || !app.datasetControl) {
            bot.sendMessage(chatId, "❌ Sistema di logging non disponibile.");
            return;
        }

        const status = app.datasetControl.getStatus();
        
        const statusIcon = status.isRecording ? "🟢" : "🔴";
        const statusText = status.isRecording ? "In corso" : "Fermo";
        
        const uptimeMinutes = Math.floor(status.uptime / 60000);
        const uptimeSeconds = Math.floor((status.uptime % 60000) / 1000);
        
        const message = 
            `📊 *Stato Log Dataset*\n\n` +
            `${statusIcon} Stato: *${statusText}*\n` +
            `📝 Record raccolti: *${status.recordCount}*\n` +
            `⏱️ Intervallo registrazione: *${status.recordingInterval}ms*\n` +
            `🕐 Uptime sessione: *${uptimeMinutes}m ${uptimeSeconds}s*\n` +
            `🕒 Timestamp: \`${status.timestamp}\``;

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('[Telegram] Errore nel recupero dello stato:', error);
        bot.sendMessage(chatId, `❌ Errore: ${error.message}`);
    }
});

// bot.onText(/\/log_stop/, (msg) => {
//     const chatId = msg.chat.id;

//     if (!isAuthenticated(chatId)) {
//         bot.sendMessage(chatId, "⚠️ Effettua il login per gestire i log.");
//         return;
//     }

//     try {
//         if (!app || !app.datasetControl) {
//             bot.sendMessage(chatId, "❌ Sistema di logging non disponibile.");
//             return;
//         }

//         const result = app.datasetControl.stop();
        
//         if (result) {
//             bot.sendMessage(chatId, "✅ Registrazione log fermata con successo.");
//         } else {
//             bot.sendMessage(chatId, "ℹ️ Nessuna registrazione in corso.");
//         }
//     } catch (error) {
//         console.error('[Telegram] Errore stop log:', error);
//         bot.sendMessage(chatId, `❌ Errore: ${error.message}`);
//     }
// });

// bot.onText(/\/log_start/, (msg) => {
//     const chatId = msg.chat.id;

//     if (!isAuthenticated(chatId)) {
//         bot.sendMessage(chatId, "⚠️ Effettua il login per gestire i log.");
//         return;
//     }

//     try {
//         if (!app || !app.datasetControl) {
//             bot.sendMessage(chatId, "❌ Sistema di logging non disponibile.");
//             return;
//         }

//         const result = app.datasetControl.start();
        
//         if (result) {
//             bot.sendMessage(chatId, "✅ Nuova registrazione log avviata.");
//         } else {
//             bot.sendMessage(chatId, "ℹ️ Registrazione già in corso.");
//         }
//     } catch (error) {
//         console.error('[Telegram] Errore start log:', error);
//         bot.sendMessage(chatId, `❌ Errore: ${error.message}`);
//     }
// });

bot.onText(/\/log_restart/, (msg) => {
    const chatId = msg.chat.id;

    if (!isAuthenticated(chatId)) {
        bot.sendMessage(chatId, "⚠️ Effettua il login per gestire i log.");
        return;
    }

    try {
        if (!app || !app.datasetControl) {
            bot.sendMessage(chatId, "❌ Sistema di logging non disponibile.");
            return;
        }

        app.datasetControl.restart();
        bot.sendMessage(chatId, "🔄 Registrazione log riavviata. Nuovo file creato.");
    } catch (error) {
        console.error('[Telegram] Errore restart log:', error);
        bot.sendMessage(chatId, `❌ Errore: ${error.message}`);
    }
});


module.exports = {
    linkBot,
    send
};

const basic_commands = [
    { command: 'login', description: "Accedi con il token di accesso per visualizzare i dati." },
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
    },
    {
        command: 'broadcast',
        description: 'Invia un messaggio a tutti gli utenti (solo admin)'
    },
    {
        command: 'log_status',
        description: 'Visualizza lo stato della registrazione log'
    },
    {
        command: 'log_start',
        description: 'Avvia una nuova registrazione log'
    },
    {
        command: 'log_stop',
        description: 'Ferma la registrazione log in corso'
    },
    {
        command: 'log_restart',
        description: 'Riavvia la registrazione (crea nuovo file)'
    }
];

let parametersMenu = {
    inline_keyboard: [
        // [
        //     { text: "📊 Visualizza il grafico fino ad ora", callback_data: "graph_position" }
        // ],
        [
            { text: "🔌🚫 Termina ricezione", callback_data: "dismiss_and_unsubscribe" }
        ]
    ]
}

const dataUtils = require("../datasetModels/datasetUtils.js");

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    const commands = userCommands.get(chatId) || [];

    // Gestione download file con countdown
    if (data.startsWith('download_')) {
        const fileName = data.replace('download_', '');
        const logDirectory = path.join(__dirname, "..", "datasetModels/saved_datas");
        const filePath = path.join(logDirectory, fileName);

        bot.answerCallbackQuery(query.id, { text: "📤 Invio file..." });

        try {
            if (!fs.existsSync(filePath)) {
                bot.sendMessage(chatId, `File non trovato: ${fileName}`);
                return;
            }
            

            let decryptionKey = null
            const fileReference = path.join(__dirname, "..", "datasetModels/logs_references.json");
            let reference = null;
            try {
                reference = dataUtils.findInElement(fileReference, "references", fileName);
                decryptionKey = reference.token;
            } catch (err) {
                console.warn('[Telegram] Reference file not found, using generated key:', err.message);
            }

            bot.sendDocument(chatId, filePath, {
                caption:
                    `📄 \`${fileName}\`\n` +
                    `🔑 *Chiave: \`${decryptionKey}\`*\n`,
                parse_mode: 'Markdown'
            }).then((sentMessage) => {

                bot.editMessageText(`*Hai ancora 10 secondi*`,{
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        parse_mode: 'Markdown',
                    }).catch(() => {});

//Rimuovi la reference dal file per cambiare chiave di criptazione
                // Decripta con la chiave fornita; se fallisce, notifica e non ricripta
                let decryptedCsv = null;
                try {
                    decryptedCsv = decryptLog(filePath, decryptionKey);
                } catch (e) {
                    console.error('[Telegram] decryptLog exception:', e);
                }

                if (!decryptedCsv) {
                    bot.sendMessage(chatId, '❌ Chiave non valida o file corrotto: impossibile decriptare.');
                } else {
                    // Ricripta con nuova chiave solo se la decrittazione ha successo
                    const newKey = generateToken();
                    const reEncrypted = encryptLog(filePath, newKey);
                    if (!reEncrypted) {
                        bot.sendMessage(chatId, '⚠️ Impossibile ricriptare con nuova chiave. Il file rimane invariato.');
                    } else {
                        dataUtils.updateInElement(fileReference, "references", fileName,
                            { name: fileName, token: newKey }
                        );
                    }
                }
                
                startTokenExpirationTimer(
                    chatId,
                    query.message.message_id,
                    10,
                    (chatID, messageID, opts) => {


                        
                        bot.deleteMessage(chatID, sentMessage.message_id).catch(() => {});
                        
                        bot.editMessageText(
                            `🚫 Tempo scaduto\n\n` +
                            `Il file \`${opts.fileName}\` e la chiave sono stati rimossi.`,
                            {
                                chat_id: chatID,
                                message_id: messageID,
                                parse_mode: 'Markdown'
                            }
                        ).then(() => {
                            setTimeout(() => {
                                bot.deleteMessage(chatID, messageID).catch(() => {});
                            }, 3000);
                        }).catch(() => {});
                    },
                    { fileName }
                );

            }).catch(err => {
                console.error('[Telegram] Error sending document:', err);
                bot.sendMessage(chatId, `Errore durante l'invio: ${err.message}`);
            });

        } catch (error) {
            console.error('[Telegram] Error in download handler:', error);
            bot.sendMessage(chatId, `Errore: ${error.message}`);
        }
        return;
    }

    // Gestione cambio pagina
    if (data.startsWith('page_')) {
        const pageNum = parseInt(data.split('_')[1], 10);

        if (isNaN(pageNum)) return;

        const logDirectory = path.join(__dirname, "..", "datasetModels/saved_datas");

        try {
            const items = fs.readdirSync(logDirectory);
            const files = items.filter(item => {
                const fullPath = path.join(logDirectory, item);
                return fs.statSync(fullPath).isFile();
            });

            const totalPages = Math.ceil(files.length / filesPerPage);
            let safePage = Math.max(0, Math.min(pageNum, totalPages - 1));

            if (pageNum < 0 || pageNum >= totalPages) {
                bot.answerCallbackQuery(query.id, { text: 'Pagine terminate' });
            } else {
                bot.answerCallbackQuery(query.id, { text: `📄 Pagina ${safePage + 1}/${totalPages}` });
            }

            bot.deleteMessage(chatId, query.message.message_id).catch(() => { });
            fetchFiles(chatId, safePage);

        } catch (error) {
            console.error('[Telegram] Errore cambio pagina:', error);
            bot.answerCallbackQuery(query.id, { text: 'Errore lettura file' });
            bot.sendMessage(chatId, `Errore: Impossibile caricare i file: ${error.message}`);
        }

        return;
    }

    if (data === 'page_info') {
        bot.answerCallbackQuery(query.id, {
            text: 'Usa ← → per navigare tra le pagine',
            show_alert: false
        });
        return;
    }

    if (data.startsWith('graph_')) {
        const parameter = data.replace('graph_', '');

        bot.answerCallbackQuery(query.id, { text: `Generazione grafico per ${parameter}...` });
        return
    }

    if (data.startsWith('request_file_')) {
        const fileName = data.replace('request_file_', '');

        if (isAuthenticated(chatId)) {
            const menu = {
                inline_keyboard: [
                    [{ text: '✅ Conferma & ⬇ Scarica', callback_data: `download_${fileName}` }],
                    [{ text: 'Annulla', callback_data: 'cancel_download' }]
                ]
            };

            bot.editMessageText(
                `Scarica \`${fileName}\`\n\n` +
                `⚠️ Se confermi, avrai *10 secondi* per scaricare il file e salvare la chiave \n` +
                `⏱️ Non potrai più richiedere il file per 24 ore.`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: menu
            });
        }
        return;
    }

    switch (data) {
        case 'token_login_question':

            let menu = {
                inline_keyboard: [
                    [
                        { text: "🔑 Ho un token di accesso", callback_data: "token_ready" }
                    ],
                ]
            }

            bot.editMessageText("Per ottenere un token di accesso, chiedi al team di fornirtene uno. Una volta ottenuto, clicca su '🔑 Ho un token di accesso' e incollalo.", {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: menu
            });
            break;
        case 'token_ready':
            bot.editMessageText("Invia nella chat il comando \/login e incolla il token di accesso \nEsempio: /login TUO_TOKEN_DI_ACCESSO", {
                chat_id: chatId,
                message_id: query.message.message_id,
            });
            break;

        case 'get_position':
            const position = getCurrentPosition();



            bot.editMessageText(`📍 *Posizione *:\nLatitudine: ${position.latitude}\nLongitudine: ${position.longitude}`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: parametersMenu
            });
            // bot.pinChatMessage(chatId, query.message.message_id);
            break;

        case 'dismiss':
            // Stoppa eventuale countdown e chiudi
            stopTokenExpirationTimer(chatId);
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            bot.deleteMessage(chatId, query.message.message_id - 1).catch(() => {});
            break;

        case 'dismiss_and_unsubscribe':
            // bot.unpinChatMessage(chatId, {
            //     message_id: query.message.message_id
            // });
            stopTokenExpirationTimer(chatId);
            bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
            bot.deleteMessage(chatId, query.message.message_id - 1).catch(() => {});
            break;

        default:
            bot.sendMessage(chatId, "Funzionalità non disponibile.");
            break;
    };
});

function isAuthenticated(chatID) {
    const users = loadUsers();
    const user = users.find(u => u.chatID === chatID && u.hasLogged);
    if (!user) {
        return false
    }

    return true;
}

const keyExprirationTimers = new Map(); // Mappa per tracciare i timer di scadenza dei token

function startTokenExpirationTimer(chatID, messageID, seconds, onComplete, options = {}) {
    if (keyExprirationTimers.has(chatID)) {
        clearInterval(keyExprirationTimers.get(chatID));
    }

    let remainingSeconds = seconds;
    const timer = setInterval(() => {
        remainingSeconds--;

        if (remainingSeconds > 0) {

            const text = `*Hai ancora ${remainingSeconds} secondi*`

            bot.editMessageText(text, {
                chat_id: chatID,
                message_id: messageID,
                parse_mode: 'Markdown'
            }).catch(err => {
                if (err.response?.body?.error_code !== 400) {
                    console.error('[Telegram] Errore update countdown:', err.message);
                }
            });
        } else {
            clearInterval(timer);
            keyExprirationTimers.delete(chatID);
            if (typeof onComplete === 'function') {
                onComplete(chatID, messageID, options);
            }
        }
    }, 1000);

    keyExprirationTimers.set(chatID, timer);
}

function stopTokenExpirationTimer(chatID) {
    if (keyExprirationTimers.has(chatID)) {
        clearInterval(keyExprirationTimers.get(chatID));
        keyExprirationTimers.delete(chatID);
        return true;
    }
    return false;
}



