The resize and drag-and-drop playground on the GitHub Pages landing page for the Interval Timer app is already in a great state. I want to turn it into a true interactive product demo that accurately represents the real application.

Please make the following improvements while preserving the current quality of the implementation.

1. Remove the pointer cursor

The draggable/resizable playground currently changes the cursor to pointer. Please remove this behavior.

The reason is consistency with the real application. I could not implement a pointer cursor in the production app, so the landing page should accurately reflect the actual user experience.

The playground must remain fully draggable and resizable exactly as it is now; only the cursor style should no longer change.

2. Make the Pin button launch the real expanded UI

The iOS Mini Screen currently contains a Pin button.

Instead of being only a visual element, pressing this button should transform the mini interface into the fully interactive desktop-sized playground.

When the Pin button is pressed:

smoothly animate from the mini screen into the expanded playground,
display the full timer interface,
preserve the current timer state,
continue running the timer without interruption,
preserve all timer logic,
preserve all animations,
preserve every interaction exactly as in the real application.

The expanded playground must not be a mockup. It should become the actual running timer interface.

3. Make the Settings / Alarm Sound module fully functional

The expanded playground should include a working version of the Alarm Sound module instead of a visual placeholder.

Replicate the behavior of the real application as closely as possible.

Specifically:

implement a drag-and-drop area similar to the production app,
allow users to paste or drop supported media links,
support YouTube and Spotify URLs,
display the same UI feedback the real application provides,
mimic the same interaction flow, validations, and user experience,
make the module feel like a genuine part of the application instead of a demo.

The goal is that visitors can understand exactly how this feature behaves before downloading the app.

4. Reuse the real application logic

Whenever possible, reuse the existing application components and business logic instead of recreating simplified HTML versions.

The landing page should embed or share the same timer logic and relevant UI components used by the application so that both remain synchronized.

Avoid duplicating code.

Prefer a shared architecture where the landing page acts as a live demo powered by the same underlying implementation as the application.

Overall Goal

The GitHub Pages landing page should evolve from a visual showcase into a fully interactive product demo.

A visitor should be able to experience the application's core workflow—including timer behavior, expansion, settings, and alarm configuration—almost exactly as they would inside the real app.

Focus on production-quality architecture, reusable components, shared state, smooth animations, maintainability, and a polished user experience. The landing page should feel like the real application running inside the browser rather than a collection of static demonstrations.
