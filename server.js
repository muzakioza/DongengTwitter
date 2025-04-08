// server.js
import express from 'express';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path'; // Needed for serving static files correctly
import { fileURLToPath } from 'url'; // Needed for __dirname in ES modules

dotenv.config(); // Load variables from .env file

const app = express();
const port = process.env.PORT || 3000; // Use environment port or default to 3000

const API_KEY = process.env.GEMINI_API_KEY;
const TWITTER_CHAR_LIMIT = 280; // Standard Twitter limit

if (!API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not set in the environment variables.");
    process.exit(1); // Exit if API key is missing
}

// --- Gemini Client Setup ---
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash", // Using flash for speed/cost efficiency
});

const generationConfig = {
    temperature: 0.8, // Add some creativity
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 1024, // Limit output length slightly
    responseMimeType: "text/plain",
};

// Define safety settings - adjust thresholds as needed
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH},
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];
// --- End Gemini Setup ---


// --- Middleware ---
app.use(express.json()); // To parse JSON request bodies

// Serve static files (HTML, CSS, JS) from the 'public' directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));


// --- Tweet Splitting Function (JavaScript version) ---
function splitIntoTweets(text, limit = TWITTER_CHAR_LIMIT) {
    const words = text.trim().split(/\s+/).filter(Boolean); // Trim text, split by whitespace, remove empty strings
    if (!words.length) {
        return []; // Return empty array if no words
    }

    const tweets = [];
    let currentTweetWords = [];
    let currentLength = 0;

    const adjustedLimit = limit; // Use the original limit

    for (const word of words) {
        // If we already have 3 tweets, stop processing
        if (tweets.length >= 3) {
            break;
        }

        const wordLen = word.length;

        if (wordLen > adjustedLimit) { // Word too long even for an empty tweet (with numbering)
            if (currentTweetWords.length > 0) {
                tweets.push(currentTweetWords.join(" "));
            }
            tweets.push(word); // Add the long word as its own tweet (will be oversized)
            currentTweetWords = [];
            currentLength = 0;
            continue;
        }

        const lengthWithWord = (currentLength === 0) ? wordLen : currentLength + wordLen + 1; // +1 for space

        if (lengthWithWord <= adjustedLimit) {
            currentTweetWords.push(word);
            currentLength = lengthWithWord;
        } else {
            tweets.push(currentTweetWords.join(" "));
            currentTweetWords = [word];
            currentLength = wordLen;
        }
    }

    // Add the last tweet if it has content
    if (currentTweetWords.length > 0 && tweets.length < 3) {
        tweets.push(currentTweetWords.join(" "));
    }

    // Return only the first 3 tweets generated
    return tweets; // No slice needed as the loop breaks
    // return tweets.slice(0, 3); // Alternative: Slice after loop completes
}


// --- API Endpoint ---
app.post('/api/generate-drama', async (req, res) => {
    const { theme, tweetCount } = req.body;

    if (!theme || typeof theme !== 'string' || theme.trim().length === 0) {
        return res.status(400).json({ error: "Invalid theme provided. Please provide a non-empty string." });
    }

    // Validate tweetCount
    const count = parseInt(tweetCount, 10);
    if (isNaN(count) || count < 5 || count > 20) {
        return res.status(400).json({ error: 'Invalid tweet count. Must be between 5 and 20.' });
    }

    console.log(`Received theme: ${theme}`); // Log received theme

    const prompt = `
        ANDA ADALAH GENERATOR CERITA FIKSI UNTUK TWITTER INDONESIA DENGAN BATASAN KESELAMATAN YANG KETAT.
        Tugas Anda: Buat sebuah CERITA FIKSI curhatan pribadi yang MENARIK dan RELATABLE dalam Bahasa Indonesia, berdasarkan tema yang diberikan, sambil mematuhi aturan berikut:

        Tema Utama: "${theme}"

        ATURAN WAJIB YANG HARUS DIIKUTI:
        1.  **DILARANG KERAS Menyebut Institusi:** Jangan pernah menyebut nama institusi seperti POLRI, TNI, Kepolisian, Tentara, atau institusi pemerintah/swasta spesifik lainnya.
        2.  **PENANGANAN SENSITIF SARA:** Hindari topik Suku, Agama, Ras, dan Antargolongan (SARA) atau etnisitas sebisa mungkin. Jika unsur ini muncul secara *minimal* dan *tak terhindarkan* HANYA dalam konteks drama FIKSI antar individu (contoh: menggambarkan perbedaan budaya yang sangat umum dan generik dalam sebuah hubungan FIKSI), WAJIB digambarkan secara EKSKLUSIF dengan cara yang NETRAL, PENUH HORMAT, dan TIDAK PERNAH merendahkan, mengkritik, membuat terlihat buruk, atau menciptakan stereotip negatif tentang kelompok manapun. Fokus utama HARUS tetap pada drama personal antar individu generik, bukan pada perbedaan kelompok. Jika ragu, JANGAN sebutkan sama sekali.
        3.  **DILARANG KERAS Menyebut Informasi Pribadi:** Jangan gunakan nama orang asli/spesifik (gunakan hanya kata ganti atau sebutan hubungan), jangan sebutkan nama kota/daerah spesifik, alamat, nomor telepon, akun media sosial, atau detail pribadi lainnya yang dapat diidentifikasi.
        4.  **DILARANG KERAS MENULIS NAMA ORANG:** Jangan pernah sebut nama orang walaupun itu samaran apabila menggunakan kata ganti didepan JANGAN DITAMBAH NAMA ORANG SETELAHNYA SEPERTI PAK AGUS, IBU EKO, ATAU SUAMI EKO.
        5.  **Gunakan Kata Ganti Umum:** Gunakan hanya kata ganti orang seperti 'aku', 'gue', 'dia', 'mereka', 'kami', atau sebutan hubungan generik seperti 'suami', 'istri', 'ibu', 'ayah', 'anak', 'teman', 'tetangga', 'mertua', 'atasan', 'rekan kerja'. JANGAN gunakan nama fiksi sekalipun (misal: Budi, Ani).
        6.  **FOKUS PADA ALUR CERITA:** Cerita harus fokus pada alur cerita fiksi yang menarik sesuai tema, tanpa menyentuh hal-hal sensitif yang dilarang atau dibatasi di atas.
        7.  **Punctuation/Spelling:** Intentionally imperfect. Aim for ~65% correct punctuation. Include occasional natural-sounding typos or common shortenings (e.g., yg, ga, aja, ywdh, gmn, jd, mngkn, gpp, lg).
        8. Vowel Removal / Consonant Focus
        yg (yang)
        dgn (dengan)
        tdk (tidak)
        blm (belum)
        sdh / udh (sudah)
        utk (untuk)
        bgt (banget)
        jg / jga (juga)
        dr (dari)
        dlm (dalam)
        lg (lagi)
        bnr (benar)
        krn (karena)
        skrg (sekarang)
        trus (terus)
        kl / klo (kalau)
        bs / bsa (bisa)
        Single Letter / Syllable Reduction:
        ga / gak / ngga (nggak / tidak)
        dah / udah (sudah)
        aja / aj (saja)
        gua / gw / gue (aku / saya - informal)
        lu / lo (kamu - informal)
        sy (saya - more formal short)
        km / qm (kamu)
        q (ku - suffix/prefix)
        ntar (nanti)
        Number Substitution:
        2 (used for duplication like sama2 (sama-sama), hati2 (hati-hati), or the number 'dua')

        Gaya Penulisan:
        - Gaya curhatan pribadi di Twitter (gunakan 'aku', 'gw').
        - Act like your life is falling apart
        - Jangan terlalu lebay atau berlebih-lebih
        - Kurangi hiperbola yang sangat fantastis
        - Jangan pakai istilah diujung tanduk atau kata dihimpit
        - kurangi ungkapan tidak umum ditulis di dalam twitter, seperti ujung tanduk, seperti bola salju
        - Jangan buat kalimat terlalu pendek
        - Jangan terlalu menarik
        - Buat lumayan kasual, jangan terlalu formal
        - Tanda baca jangan selalu tepat, buat sekitar 65% tepat
        - Buat beberapa kata terdapat kesalahan pengejaan yang alami
        - Ceritakan kejadian secara kronologis atau tematis dalam format thread. Gunakan gaya bahasa sehari-hari yang wajar, hindari hiperbola atau drama yang berlebihan.
        - Boleh diselipkan bahasa gaul/slang Indonesia yang umum (contoh: nyesek, baper, anjir, parah, sumpah, gila, dll) secara natural TAPI jangan berlebihan.
        - Harus jelas terasa seperti cerita fiksi, BUKAN berita atau kejadian nyata. JANGAN tambahkan penomoran tweet seperti [1/5] atau (1/5) di awal paragraf.
        - Usahakan menghasilkan teks yang cukup panjang untuk bisa dibagi menjadi beberapa tweet (minimal 3-5 paragraf/ide pokok).
        - Akhiri dengan cara yang natural, bisa berupa kesimpulan, pertanyaan ke pembaca, atau sekadar penutup cerita. Tidak harus selalu menggantung atau sangat emosional.

        PENTING SEKALI: Prioritaskan kepatuhan pada ATURAN WAJIB di atas segalanya. Hasil akhir harus 100% FIKSI, aman, dan tidak menyinggung. Fokus pada alur cerita menarik sesuai tema "${theme}". Jangan sertakan komentar tentang prompt ini dalam jawabanmu. Langsung tulis ceritanya. JANGAN BUAT CERITA TERLALU PENDEK. Cerita harus terdiri dari TEPAT ${count} tweet. Setiap tweet harus dimulai dengan nomor urut diikuti titik dan spasi (contoh: "1. [isi tweet]"). Setiap tweet harus ringkas dan menarik, dengan batas karakter Twitter. Pastikan alur cerita mengalir dan berakhir dengan konklusi atau cliffhanger yang sesuai dengan jumlah tweet. Gunakan bahasa Indonesia sehari-hari yang viral dan dramatis.
        `;
    // *** END OF UPDATED PROMPT ***

    try {
        console.log("Sending request to Gemini API...");
        const chatSession = model.startChat({
            generationConfig,
            safetySettings,
            history: [], // Start fresh for each request
        });

        const result = await chatSession.sendMessage(prompt);
        const rawStory = result.response.text(); // Access text correctly
        console.log("Received response from Gemini.");

        if (!rawStory || rawStory.trim().length === 0) {
             console.log("Gemini returned empty story.");
             // Check for safety blocks included in the response object
             if (result.response.promptFeedback?.blockReason) {
                 console.error("Request blocked due to safety settings:", result.response.promptFeedback.blockReason);
                 return res.status(400).json({ error: `Request blocked by safety filter: ${result.response.promptFeedback.blockReason}. Try a different theme.` });
             }
             // If no text and no explicit block reason, give a generic message
             return res.status(500).json({ error: "AI returned an empty story or response. Try a different theme." });
        }

        // Split the story into tweets
        const tweetSegments = splitIntoTweets(rawStory); // Use the modified function

        // --- Send Response ---
        res.json({
            tweets: tweetSegments, // Send the array of segments
            count: tweetSegments.length, // Send the actual count (0-3)
            theme_used: theme
        });

    } catch (error) {
        console.error("Error during Gemini API call or processing:", error);
        let userErrorMessage = "An unexpected error occurred while generating the story.";
        // More robust error checking
        if (error.message) {
             if (error.message.includes('quota')) {
                userErrorMessage = "API quota exceeded. Please try again later.";
            } else if (error.message.includes('API key not valid')) {
                userErrorMessage = "Server configuration error: Invalid API Key.";
            } else if (error.message.includes('SAFETY') || error.message.includes('blocked')) { // Catch general safety errors
                 userErrorMessage = "The request was blocked likely due to safety settings. Try a different theme or phrasing.";
            } else if (error.message.includes('fetch') || error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
                userErrorMessage = "Network error: Could not connect to the AI service. Check internet connection and API endpoint.";
            } else {
                 // Keep a generic message for other errors, but log the specific one
                 console.error("Unhandled Error Type:", error.message);
            }
        }

        // Check specifically for safety feedback in the error object structure if available
        if (error.response?.promptFeedback?.blockReason) {
             userErrorMessage = `Request blocked due to safety settings: ${error.response.promptFeedback.blockReason}. Try a different theme or phrasing.`;
             console.error("Safety Feedback:", error.response.promptFeedback);
        }


        res.status(500).json({ error: userErrorMessage });
    }
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Frontend accessible at http://localhost:${port}`);
});