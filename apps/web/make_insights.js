const fs = require("fs");
const path = require("path");

const fileDir = path.join(process.cwd(), "app", "insights");
if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

console.log("Ready to receive page code at app/insights/page.tsx");
