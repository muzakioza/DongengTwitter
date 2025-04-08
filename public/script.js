// public/script.js

// Get references to HTML elements
const dramaForm = document.getElementById('dramaForm');
const themeCheckboxesContainer = document.getElementById('themeCheckboxes'); // Container for checkboxes/tiles
const themeCheckboxes = themeCheckboxesContainer.querySelectorAll('input[type="checkbox"][name="theme"]'); // Still get the hidden checkboxes
const themeTiles = themeCheckboxesContainer.querySelectorAll('.theme-tile'); // Get the visible labels/tiles
const checkboxWarning = document.getElementById('checkboxWarning'); // Get the warning element
const generateButton = document.getElementById('generateBtn');
const resultsDiv = document.getElementById('storyResult');
const loadingIndicator = document.getElementById('loading');
const tweetCountInput = document.getElementById('tweetCount'); // Get the tweet count input
const TWITTER_CHAR_LIMIT = 280; // Define constant for display/info purposes
const MAX_THEMES = 3; // Maximum allowed themes

// --- Tile Selection & Checkbox Limit Logic ---
// Use event delegation on the container for efficiency
themeCheckboxesContainer.addEventListener('click', (event) => {
    // Check if the clicked element is a theme tile (label)
    if (event.target.classList.contains('theme-tile')) {
        const labelFor = event.target.getAttribute('for');
        const correspondingCheckbox = document.getElementById(labelFor);

        if (correspondingCheckbox) {
            const currentlyChecked = themeCheckboxesContainer.querySelectorAll('input[type="checkbox"][name="theme"]:checked');

            // Check if clicking would exceed the limit
            // Only prevent checking if it's currently unchecked AND the limit is reached
            if (!correspondingCheckbox.checked && currentlyChecked.length >= MAX_THEMES) {
                checkboxWarning.style.display = 'block'; // Show warning
                // Optional: maybe a quick visual cue it can't be selected?
            } else {
                // Toggle the checkbox state *manually* because we might prevent the default label action
                correspondingCheckbox.checked = !correspondingCheckbox.checked;
                checkboxWarning.style.display = 'none'; // Hide warning

                // Important: After changing checkbox state, re-evaluate button state
                updateSubmitButtonState();
            }
            // Prevent the default label behavior which might toggle the checkbox again
            event.preventDefault();
        }
    }
});

// Function to update submit button enabled/disabled state
function updateSubmitButtonState() {
    const checkedCount = themeCheckboxesContainer.querySelectorAll('input[type="checkbox"][name="theme"]:checked').length;
    generateButton.disabled = !(checkedCount > 0 && checkedCount <= MAX_THEMES);
}

// --- Helper Function to Randomly Lowercase ---
function randomlyLowercase(text, probability = 0.67) {
    return text.split('').map(char => {
        // Check if it's an uppercase letter (A-Z)
        if (char >= 'A' && char <= 'Z') {
            // Randomly decide whether to convert to lowercase
            if (Math.random() < probability) {
                return char.toLowerCase();
            }
        }
        // Return original character if not uppercase or if probability check fails
        return char;
    }).join('');
}

// --- Form Submission Logic ---
dramaForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent the default form submission

    // Get selected themes from checkboxes
    const selectedThemes = Array.from(themeCheckboxes)
                               .filter(checkbox => checkbox.checked)
                               .map(checkbox => checkbox.value);

    // Validation
    if (selectedThemes.length === 0) {
        resultsDiv.innerHTML = '<p class="error">Silakan pilih setidaknya satu tema.</p>';
        return; // Stop if no theme is selected
    }
    if (selectedThemes.length > MAX_THEMES) {
        // This shouldn't happen due to the event listener, but double-check
        resultsDiv.innerHTML = `<p class="error">Hanya bisa memilih maksimal ${MAX_THEMES} tema.</p>`;
        return;
    }

    const tweetCount = tweetCountInput.value;

    // Simple validation for tweet count (you might want more robust validation)
    if (!tweetCount || tweetCount < 5 || tweetCount > 20) {
        alert('Jumlah tweet harus antara 5 dan 20.');
        tweetCountInput.focus();
        return;
    }

    // Combine selected themes into a single string
    const combinedTheme = selectedThemes.join(', '); // Join with comma and space

    // --- Prepare UI for loading ---
    resultsDiv.innerHTML = ''; // Clear any previous results
    loadingIndicator.style.display = 'block'; // Show loading indicator
    generateButton.disabled = true; // Disable button
    generateButton.textContent = 'Membuat...'; // Update button text

    try {
        // --- Make the API Call ---
        const response = await fetch('/api/generate-drama', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                theme: combinedTheme,
                tweetCount: parseInt(tweetCount, 10) // Send the tweet count
            }),
        });

        // Check if the response status is OK (e.g., 200)
        if (!response.ok) {
            // Try to parse error message from backend if available
            let errorData;
            try {
                errorData = await response.json();
            } catch (parseError) {
                // If parsing fails, use the status text
                throw new Error(`Gagal mengambil data: ${response.statusText} (Status ${response.status})`);
            }
             // Use the error message from the backend JSON, or a default
             throw new Error(errorData.error || `Terjadi kesalahan server (Status ${response.status})`);
        }

        // Parse the JSON response from the backend
        const data = await response.json();

        // --- Display Results ---
        if (data.tweets && data.tweets.length > 0) {
            displayTweets(data.tweets, data.count, data.theme_used); // Use the display function
        } else {
            // Handle cases where the backend might return success but no tweets
            resultsDiv.innerHTML = '<p class="error">AI tidak menghasilkan cerita. Coba tema lain.</p>';
        }

    } catch (error) {
        // --- Handle Errors ---
        console.error("Error during API call or processing:", error);
        // Display a user-friendly error message, using the error message thrown
        resultsDiv.innerHTML = `<p class="error">Terjadi kesalahan: ${escapeHtml(error.message)}</p>`;

    } finally {
        // --- Reset UI after loading (whether success or error) ---
        loadingIndicator.style.display = 'none'; // Hide loading indicator
        // Re-enable button only if at least one theme is selected
        const checkedCount = themeCheckboxesContainer.querySelectorAll('input[type="checkbox"][name="theme"]:checked').length;
        generateButton.disabled = (checkedCount === 0);
        generateButton.textContent = 'Buat Cerita Drama!'; // Reset button text
    }
});

// --- Function to Display Tweets ---
function displayTweets(tweets, count, themeUsed) {
    // Clear previous results
    resultsDiv.innerHTML = '';

    // Add a header indicating the theme used
    const header = document.createElement('h2');
    header.textContent = `Cerita Fiksi untuk Tema: "${escapeHtml(themeUsed)}" (${count} tweet)`;
    resultsDiv.appendChild(header);

    // Create a container for the tweets
    const tweetContainer = document.createElement('div');
    tweetContainer.className = 'tweet-container'; // Add class for styling

    // Loop through each tweet string and create elements
    tweets.forEach((tweetText, index) => {
        const modifiedTweetText = randomlyLowercase(tweetText); // Apply random lowercase

        const tweetElement = document.createElement('div');
        tweetElement.className = 'tweet'; // Class for individual tweet styling

        // Create paragraph for the tweet text
        const tweetContent = document.createElement('p');
        // Use the modified text for display
        tweetContent.innerHTML = escapeHtml(modifiedTweetText).replace(/\n/g, '<br>');

        // Append content to the tweet element
        tweetElement.appendChild(tweetContent);

        // Add 'Copy' button for each tweet
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Salin Tweet';
        copyButton.className = 'copy-button';
        copyButton.onclick = () => {
            // IMPORTANT: Copy the ORIGINAL unmodified text
            navigator.clipboard.writeText(tweetText) // Use original tweetText here
                .then(() => {
                    copyButton.textContent = 'Disalin!';
                    setTimeout(() => { copyButton.textContent = 'Salin Tweet'; }, 1500);
                })
                .catch(err => {
                    console.error('Gagal menyalin teks: ', err);
                    copyButton.textContent = 'Gagal Menyalin';
                     setTimeout(() => { copyButton.textContent = 'Salin Tweet'; }, 1500);
                });
        };
        tweetElement.appendChild(copyButton);

        // Append the tweet element to the container
        tweetContainer.appendChild(tweetElement);
    });

    // Append the tweet container to the main results div
    resultsDiv.appendChild(tweetContainer);
}

// --- Helper Function ---
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#39;");
}

// Initial state: Disable button if no checkboxes are checked at load
updateSubmitButtonState(); // Call the function to set initial state