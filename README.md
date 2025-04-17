An Electron-based desktop application for managing interval timers and countdown timers. This app is designed to help users efficiently manage work and break intervals, making it ideal for productivity techniques like the Pomodoro Technique.

## Features

- **Interval Timer**: Set work and break intervals with customizable durations and loop counts.
- **Countdown Timer**: A simple timer for single countdowns.
- **Pause and Resume**: Pause and resume timers without losing progress.
- **Custom Alarm Settings**: Configure alarm durations for work, break, and countdown timers.
- **Tab Navigation**: Switch between the Interval Timer and Countdown Timer views.
- **Responsive UI**: A clean and user-friendly interface with responsive design.

## Screenshots

![image](https://github.com/user-attachments/assets/0557966c-1f66-4777-9895-165fbcbc31ba)

*Example of the Interval Timer interface.*

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/interval-timer.git
   cd interval-timer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

## Usage

1. **Interval Timer**:
   - Navigate to the "Interval Timer" tab.
   - Set work and break durations, and the number of loops.
   - Click "Start Loop" to begin the timer.

2. **Countdown Timer**:
   - Navigate to the "Timer" tab.
   - Set the desired countdown duration.
   - Click "Start" to begin the countdown.

3. **Pause/Resume**:
   - Use the "Pause" and "Continue" buttons to manage the timer's state.

4. **Reset**:
   - Click "Reset" to stop and reset the timer.

5. **Settings**:
   - Click the ⚙️ icon to open the settings modal.
   - Configure alarm durations for work, break, and countdown timers.

## Project Structure

```
interval-timer/
├── assets/                # Static assets (e.g., alarm sound, screenshots)
├── css/                   # Stylesheets
│   └── styles.css
├── js/                    # JavaScript source files
│   ├── intervalTimer.js   # Logic for the interval timer
│   ├── timer.js           # Logic for the countdown timer
│   ├── renderer.js        # Main renderer logic
│   ├── tabs.js            # Tab navigation logic
│   └── views/             # View templates
│       ├── intervalTimerView.js
│       └── timerView.js
├── index.html             # Main HTML file
├── main.js                # Electron main process
├── package.json           # Project metadata and scripts
└── .gitignore             # Ignored files and directories
```

## Development

To modify or extend the application:

1. Make changes to the JavaScript files in the js directory.
2. Update styles in styles.css.
3. Test the application by running:
   ```bash
   npm start
   ```

## Build

To package the application for distribution:

1. Install `electron-builder`:
   ```bash
   npm install electron-builder --save-dev
   ```

2. Build the application:
   ```bash
   npm run build
   ```

3. The packaged application will be available in the `dist/` directory.

## Dependencies

- [Electron](https://www.electronjs.org/) - Build cross-platform desktop apps with JavaScript, HTML, and CSS.

## License

This project is licensed under the ISC License. See the LICENSE file for details.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests to improve the project.

## Acknowledgments

- Inspired by productivity techniques like the Pomodoro Technique.
- UI design inspired by modern minimalistic styles.

---

Enjoy using **Interval Timer** to boost your productivity! 🚀
