// Human-readable list of what was picked up from the photo.
export const traitLabels = (p) => [
  p.hairLength + ' hair', p.bangs && 'bangs', p.recede && 'receding', p.volume > 0.2 && 'big hair',
  p.glasses && (p.tint ? 'tinted glasses' : 'glasses'), p.beard && 'stubble', p.headwear && 'headband',
  p.earrings && 'earrings', p.curly && 'curly', p.squint ? 'happy eyes' : p.lightEyes && 'light eyes',
  p.mouth === 'grin' ? 'big smile' : p.mouth === 'smile' ? 'smile' : 'calm', p.kid && 'kid',
].filter(Boolean);
