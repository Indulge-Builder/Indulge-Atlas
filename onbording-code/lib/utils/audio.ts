const NOTIFICATION_SOUND_SRC = "/sounds/notification.mp3";
const NOTIFICATION_VOLUME = 0.6;

/**
 * Plays the in-app notification chime. Safe under strict browser autoplay rules:
 * failures (e.g. NotAllowedError before user gesture) are caught and logged only.
 */
export function playNotificationSound(): void {
  try {
    const audio = new Audio(NOTIFICATION_SOUND_SRC);
    audio.volume = NOTIFICATION_VOLUME;
    void audio.play().catch((err: unknown) => {
      const isNotAllowed =
        (err instanceof DOMException && err.name === "NotAllowedError") ||
        (err instanceof Error && err.name === "NotAllowedError");
      if (isNotAllowed) {
        console.warn(
          "[audio] Notification sound blocked by autoplay policy (interaction may be required).",
        );
        return;
      }
      console.warn("[audio] Notification sound could not play:", err);
    });
  } catch (err) {
    console.warn("[audio] Failed to initialize notification sound:", err);
  }
}
