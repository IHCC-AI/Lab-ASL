const ui = {
    start: document.querySelector('#start-button'),
    stop: document.querySelector('#stop-button'),
    capture: document.querySelector('#capture-button'),
    clear: document.querySelector('#clear-button'),
    letter: document.querySelector('#letter-select'),
    count: document.querySelector('#training-count'),
    video: document.querySelector('#video'),
    canvas: document.querySelector('#canvas'),
    status: document.querySelector('#status'),
    result: document.querySelector('#prediction'),
};

const LETTERS = ['A', 'B', 'C', 'D'];

// Pairs of keypoints joined by a line in the hand skeleton (drawing only).
// prettier-ignore
const BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
];

const ctx = ui.canvas.getContext('2d');
const frame = document.createElement('canvas'); // copy of the current video frame
const examples = []; // { letter, features }
const counts = {}; // letter -> the table cell showing its example count
let detector;
let stream; // webcam stream, if the camera is on
let features; // numbers describing the current hand, if one is seen

// Turns the 21 keypoints into numbers that ignore hand position and size.
function getFeatures(keypoints) {
    const wrist = keypoints[0];
    const palmWidth = Math.hypot(
        keypoints[5].x - keypoints[17].x,
        keypoints[5].y - keypoints[17].y,
    );
    return keypoints.flatMap(({ x, y }) => [
        (x - wrist.x) / palmWidth,
        (y - wrist.y) / palmWidth,
    ]);
}

// Returns the letter of the saved example closest to the current hand.
function guessLetter() {
    const distance = (example) =>
        Math.hypot(...features.map((value, i) => value - example.features[i]));
    return examples.reduce((best, e) =>
        distance(e) < distance(best) ? e : best,
    ).letter;
}

// Updates the whole page to match the current data.
function render() {
    ui.start.disabled = Boolean(stream);
    ui.stop.disabled = !stream;
    ui.canvas.hidden = !stream;
    ui.capture.disabled = !features;
    if (!stream) {
        ui.status.textContent = 'Camera is off. Choose Start camera.';
    } else if (features) {
        ui.status.textContent = 'Hand detected.';
    } else {
        ui.status.textContent =
            'Looking for a hand. Show an open palm in good light.';
    }
    LETTERS.forEach((letter) => {
        counts[letter].textContent = examples.filter(
            (e) => e.letter === letter,
        ).length;
    });
    if (!features) {
        ui.result.textContent = '—';
    } else if (examples.length === 0) {
        ui.result.textContent = '?';
    } else {
        ui.result.textContent = guessLetter();
    }
}

function drawHand(keypoints) {
    const size = ui.canvas.width / 200;
    ctx.strokeStyle = ctx.fillStyle = '#00e676';
    ctx.lineWidth = size;
    for (const [from, to] of BONES) {
        ctx.beginPath();
        ctx.moveTo(keypoints[from].x, keypoints[from].y);
        ctx.lineTo(keypoints[to].x, keypoints[to].y);
        ctx.stroke();
    }
    for (const { x, y } of keypoints) {
        ctx.beginPath();
        ctx.arc(x, y, size * 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Keeps finding the hand and drawing it while the camera is on.
async function detectLoop() {
    while (stream) {
        frame.getContext('2d').drawImage(ui.video, 0, 0);
        const [hand] = await detector.detect(frame);
        if (!stream) return;

        ctx.drawImage(frame, 0, 0);
        features = hand && getFeatures(hand.keypoints);
        if (hand) drawHand(hand.keypoints);
        render();

        await new Promise(requestAnimationFrame);
    }
}

async function startCamera() {
    ui.start.disabled = true;
    ui.status.textContent = 'Loading model and camera…';
    detector ??= await ml5.handPose();

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch {
        ui.start.disabled = false;
        ui.status.textContent = 'Could not open the camera. Allow access.';
        return;
    }

    ui.video.srcObject = stream;
    await ui.video.play();
    ui.canvas.width = frame.width = ui.video.videoWidth;
    ui.canvas.height = frame.height = ui.video.videoHeight;
    render();
    detectLoop();
}

function stopCamera() {
    stream.getTracks().forEach((track) => track.stop());
    stream = undefined;
    features = undefined;
    render();
}

// Adds a dropdown option and a table row for each letter.
LETTERS.forEach((letter) => {
    ui.letter.append(new Option(letter));
    const row = ui.count.insertRow();
    row.insertCell().textContent = letter;
    counts[letter] = row.insertCell();
});

ui.start.addEventListener('click', startCamera);
ui.stop.addEventListener('click', stopCamera);
ui.capture.addEventListener('click', () => {
    examples.push({ letter: ui.letter.value, features });
    render();
});
ui.clear.addEventListener('click', () => {
    examples.length = 0;
    render();
});

render();
