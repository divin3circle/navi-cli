/**
 * Simple spinner for showing progress
 */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private currentFrame = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private message: string = "";

  /**
   * Start the spinner
   */
  start(message: string) {
    this.message = message;
    this.intervalId = setInterval(() => {
      this.render();
    }, 80);
    // Hide cursor
    process.stdout.write("\x1b[?25l");
  }

  /**
   * Stop the spinner
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Clear line and show cursor
    process.stdout.write("\r\x1b[K"); // Clear line
    process.stdout.write("\x1b[?25h"); // Show cursor
  }

  /**
   * Update the message
   */
  update(message: string) {
    this.message = message;
  }

  /**
   * Render the current frame
   */
  private render() {
    const frame = this.frames[this.currentFrame];
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    
    // Clear line, print frame + message
    process.stdout.write(`\r\x1b[K\x1b[36m${frame}\x1b[0m ${this.message}`);
  }
}
