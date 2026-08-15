const fs = require("fs");

const text = fs.readFileSync("songy", "utf-8");
last2Lines = text.split("\n").slice(-2).join("\n");
const chars = last2Lines.split("");
const convert = {
  a: "e",
  e: "i",
  i: "o",
  o: "u",
  u: "y",
  y: "a",
};

const converted = chars.map((c) => {
  const lower = c.toLowerCase();
  if (convert[lower]) {
    const newChar = convert[lower];
    return c === lower ? newChar : newChar.toUpperCase();
  }
  return c;
});

const result = text + converted.join("");
fs.writeFileSync("songy", result);
