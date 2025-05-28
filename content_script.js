// content_script.js
// Highlights all <mcp> tags by giving them a yellow background.
document.querySelectorAll('mcp').forEach(tag => {
  tag.style.backgroundColor = 'yellow';
});

