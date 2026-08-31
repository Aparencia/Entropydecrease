const PALETTE = {
  red: { light: "#E5484D", dark: "#FF6369" },
  orange: { light: "#F76B15", dark: "#FF8B3D" },
  yellow: { light: "#F5D90A", dark: "#FFE45C" },
  green: { light: "#30A46C", dark: "#3DD68C" },
  teal: { light: "#12A594", dark: "#29E0CB" },
  blue: { light: "#0091FF", dark: "#5EB1FF" },
  purple: { light: "#8E4EC6", dark: "#C59BFF" },
  pink: { light: "#D6409F", dark: "#FF8AD8" },
  brown: { light: "#8D6E63", dark: "#B89B8A" },
  gray: { light: "#8E8E93", dark: "#9E9EA3" },
  black: { light: "#1C1C1E", dark: "#F2F2F7" },
  white: { light: "#FFFFFF", dark: "#1C1C1E" },
};
function lum(hex) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
function onColor(hex) {
  return ratio(hex, "#000000") >= ratio(hex, "#FFFFFF") ? "#1C1C1E" : "#FFFFFF";
}
for (const theme of ["light", "dark"]) {
  console.log(`/* ${theme} */`);
  for (const [id, c] of Object.entries(PALETTE)) {
    console.log(`.note-mark-${id} { background: ${c[theme]}; color: ${onColor(c[theme])}; }`);
  }
}
