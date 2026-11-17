// Sneaker Palace look for captions, highlights and the end card: monochrome, Nike/Adidas style (the site has no
// accent colour). Shared by edit.mjs and endcard.mjs; change the look here only.
export const THEME = {
	// Caption: headline white on a black pill, detail black on a white pill.
	headline: { color: '#ffffff', background: '#000000' },
	detail: { color: '#000000', background: '#ffffff' },
	pillShadow: '0 2px 12px rgba(0,0,0,.35)', // keeps the white pill's edge visible on white pages
	// Highlight: the rest of the frame dimmed, a crisp white ring with a soft dark shadow, a black label pill.
	dim: 'rgba(0,0,0,.5)',
	ring: '#ffffff',
	ringShadow: '0 0 0 1px rgba(0,0,0,.35), 0 6px 26px 4px rgba(0,0,0,.45)',
	label: { color: '#ffffff', background: '#000000', border: 'rgba(255,255,255,.9)' },
	// End card.
	endcard: { background: '#18181b', name: '#ffffff', sub: '#d4d4d8', url: '#ffffff' },
};

// CSS for the overlay pages (caption + highlight), given embedded font URLs.
export const overlayCss = ({ inter700, inter600 }) => `
	@font-face{font-family:Inter;font-weight:700;src:url('${inter700}')}
	@font-face{font-family:Inter;font-weight:600;src:url('${inter600}')}
	html,body{margin:0;width:1920px;height:1080px;background:transparent;font-family:Inter;overflow:hidden}
	.cap{position:absolute;left:64px;display:flex;flex-direction:column;align-items:flex-start;gap:10px}
	.cap span{padding:10px 18px;border-radius:6px;box-shadow:${THEME.pillShadow}}
	.h{color:${THEME.headline.color};background:${THEME.headline.background};font-weight:700;font-size:40px}
	.d{color:${THEME.detail.color};background:${THEME.detail.background};font-weight:600;font-size:30px}
	.ring{position:absolute;border-radius:16px;box-shadow:0 0 0 9999px ${THEME.dim},0 0 0 3px ${THEME.ring},${THEME.ringShadow}}
	.label{position:absolute;background:${THEME.label.background};color:${THEME.label.color};font-weight:700;font-size:30px;padding:14px 22px;
		border-radius:10px;white-space:nowrap;box-shadow:0 0 0 2px ${THEME.label.border},0 4px 18px rgba(0,0,0,.4)}
	.label.left:after{content:'';position:absolute;right:-15px;top:50%;margin-top:-14px;border:14px solid transparent;border-left:16px solid ${THEME.label.background};border-right:0}
	.label.below:after{content:'';position:absolute;top:-15px;left:36px;border:14px solid transparent;border-bottom:16px solid ${THEME.label.background};border-top:0}
	.label.right:after{content:'';position:absolute;left:-15px;top:50%;margin-top:-14px;border:14px solid transparent;border-right:16px solid ${THEME.label.background};border-left:0}
`;
