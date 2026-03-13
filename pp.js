const from = "abcdefghijklmnopqrstuvwxyz ,'";
const to = "ɐqɔpǝɟᵷɥᴉfʞꞁɯuodbɹsʇnʌʍxʎz ',";
const map = {};
for (let i = 0; i < from.length; i++) {
  map[from[i]] = to[i];
}

function convert(str) {
  let res = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (map[c]) {
      res += map[c];
    } else {
      throw new Error(`Character ${c} not found in mapping`);
    }
  }
  return res.reverse();
}
String.prototype.reverse = function () {
  return this.split("").reverse().join("");
};

console.log(convert("wow, gemini, you are so cool"));
