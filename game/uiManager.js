export function showLostScreen(message = 'YOU LOST') {
    console.log(`Displaying ${message} screen`);

    let gameOverScreen = document.getElementById('game-over-screen');
    if (!gameOverScreen) {
        gameOverScreen = document.createElement('div');
        gameOverScreen.id = 'game-over-screen';
        gameOverScreen.style.position = 'fixed';
        gameOverScreen.style.top = '0';
        gameOverScreen.style.left = '0';
        gameOverScreen.style.width = '100vw';
        gameOverScreen.style.height = '100vh';
        gameOverScreen.style.backgroundColor = 'black';
        gameOverScreen.style.display = 'flex';
        gameOverScreen.style.justifyContent = 'center';
        gameOverScreen.style.alignItems = 'center';
        gameOverScreen.style.zIndex = '9999';

        const text = document.createElement('h1');
        text.textContent = message;
        text.style.color = 'red';
        text.style.fontSize = '5rem';
        text.style.fontFamily = 'serif';
        text.style.textShadow = '0 0 10px darkred';

        gameOverScreen.appendChild(text);
        document.body.appendChild(gameOverScreen);
    } else {
        gameOverScreen.style.display = 'flex';
        // Update text if screen already exists
        const text = gameOverScreen.querySelector('h1');
        if (text) text.textContent = message;
    }
}
