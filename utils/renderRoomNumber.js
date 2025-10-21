function renderRoomNumber(tpl, { block, floorLevel, seq }) {
  const floorStr = floorLevel != null ? String(floorLevel) : "";
  let out = String(tpl);

  // thay tất cả lần xuất hiện
  out = out.replace(/\{block\}/g, block ?? "");
  out = out.replace(/\{floorLevel\}/g, floorStr);
  out = out.replace(/\{floor\}/g, floorStr);

  // {seq} | {seq:02} | {seq:03} ...
  out = out.replace(/\{seq(?::(\d+))?\}/g, (_m, p1) => {
    const pad = p1 ? parseInt(p1, 10) : 0;
    const s = String(seq ?? "");
    return pad ? s.padStart(pad, "0") : s;
  });

  return out;
}
module.exports = renderRoomNumber;
