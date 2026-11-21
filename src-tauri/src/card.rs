//! The card of a listed item (pointer over a listing row of the price check): its own transparent,
//! click-through window beside the popup, on the side with more room, as tall as the game, so a
//! long card fits whatever the popup's height (Exiled Exchange 2 shows it left of the price check).
//!
//! The window is shown (empty) as soon as a card is asked for and stays shown while the popup is:
//! a hidden WebView2 window throttles its timers and rendering, which made the first version, that
//! drew the card hidden and showed the window afterwards, slow to react (owner, 21.11.2026).
//! Hiding a card only clears the page; the window goes with the popup (`hide_window`).

use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager};

use crate::constants::{CARD_EVENT, CARD_WIDTH_LOGICAL, CARD_WINDOW as LABEL};
use crate::platform::{self, Rect};
use crate::state::AppState;

/// Each card asked for gets a number; the page answers with it once drawn (for the log).
static GENERATION: AtomicU64 = AtomicU64::new(0);
/// When the latest card was asked for: the log says how long the page took to draw it.
static ASKED: Mutex<Option<(u64, Instant)>> = Mutex::new(None);

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        platform::make_no_activate(window.hwnd()?.0 as platform::RawHwnd);
        window.set_ignore_cursor_events(true)?;
    }
    Ok(())
}

/// Which side of the popup the card goes and the card window's rect: the side with more room in
/// the game (at 1920 px a 960 px popup next to the inventory leaves ~290 px on its left and the
/// inventory's ~660 px on its right), kept inside the game, as tall as the game. With too little
/// room on both sides it overlaps the popup rather than leave the game.
pub fn placement(game: Rect, popup: Rect, width: i32) -> (Rect, &'static str) {
    let room_left = popup.x - game.x;
    let room_right = (game.x + game.width) - (popup.x + popup.width);
    let left = room_left >= room_right;
    let x = if left {
        (popup.x - width).max(game.x)
    } else {
        (popup.x + popup.width).min(game.x + game.width - width)
    };
    let rect = Rect {
        x,
        y: game.y,
        width,
        height: game.height,
    };
    (rect, if left { "left" } else { "right" })
}

fn card_hwnd(app: &AppHandle) -> Option<platform::RawHwnd> {
    let window = app.get_webview_window(LABEL)?;
    Some(window.hwnd().ok()?.0 as platform::RawHwnd)
}

/// Shows `card` next to the popup row from `row_top` to `row_bottom` (logical px of the popup page).
pub fn show(
    app: &AppHandle,
    card: serde_json::Value,
    row_top: f64,
    row_bottom: f64,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    if !state.popup_visible() {
        return Ok(());
    }
    let game = state.placement().ok_or("no game placement")?.game;
    let popup = platform::window_rect(state.popup_hwnd()).ok_or("no popup rect")?;
    let scale = state.game_hwnd().map_or(1.0, platform::monitor_scale);
    let width = (CARD_WIDTH_LOGICAL * scale).round() as i32;
    let (rect, side) = placement(game, popup, width);
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    *ASKED.lock().unwrap() = Some((generation, Instant::now()));
    // Visible before the page draws: a hidden window would draw slowly (see the module docs).
    if let Some(hwnd) = card_hwnd(app) {
        platform::show_no_activate(hwnd, rect);
    }
    // The row in the card window's logical px: the window starts at the game's top.
    let offset = f64::from(popup.y - game.y) / scale;
    app.emit_to(
        LABEL,
        CARD_EVENT,
        serde_json::json!({
            "generation": generation,
            "card": card,
            "rowTop": offset + row_top,
            "rowBottom": offset + row_bottom,
            "side": side,
        }),
    )
    .map_err(|e| e.to_string())
}

/// The page drew the card of `generation`: log how long that took after it was asked for.
pub fn ready(generation: u64) {
    if let Some((asked, at)) = *ASKED.lock().unwrap()
        && asked == generation
    {
        log::info!("[card] drawn in {} ms", at.elapsed().as_millis());
    }
}

/// Clears the card (pointer left the row or the eye, new search); the window stays for the next one.
pub fn hide(app: &AppHandle) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    let _ = app.emit_to(LABEL, CARD_EVENT, serde_json::Value::Null);
}

/// The popup hid: the card window goes too.
pub fn hide_window(app: &AppHandle) {
    hide(app);
    if let Some(hwnd) = card_hwnd(app) {
        platform::hide(hwnd);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GAME: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };

    fn popup(x: i32) -> Rect {
        Rect {
            x,
            y: 200,
            width: 960,
            height: 590,
        }
    }

    #[test]
    fn goes_where_there_is_more_room() {
        // Popup next to the inventory: 294 px free on its left, 666 px (the inventory) on its right.
        let (rect, side) = placement(GAME, popup(294), 460);
        assert_eq!(side, "right");
        assert_eq!(
            (rect.x, rect.y, rect.width, rect.height),
            (1254, 0, 460, 1080)
        );
        // Popup next to the stash: over the stash, on its left.
        let (rect, side) = placement(GAME, popup(666), 460);
        assert_eq!((side, rect.x), ("left", 206));
    }

    #[test]
    fn stays_inside_the_game() {
        // Centred: 480 px each side, the card fits on the left.
        let (rect, side) = placement(GAME, popup(480), 460);
        assert_eq!((side, rect.x), ("left", 20));
        // A small game window: 200 px each side, the card overlaps the popup but stays in the game.
        let small = Rect {
            width: 1360,
            ..GAME
        };
        let (rect, side) = placement(small, popup(200), 460);
        assert_eq!((side, rect.x), ("left", 0));
    }
}
