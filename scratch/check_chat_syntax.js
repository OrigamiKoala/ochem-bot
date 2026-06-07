try {
  await import('../api/chat.js');
  console.log("api/chat.js imported successfully with no syntax errors!");
} catch (e) {
  console.error("api/chat.js import failed:", e.message);
  console.error(e.stack);
}
