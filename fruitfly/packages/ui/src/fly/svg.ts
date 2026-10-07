/**
 * Procedural fruit fly, drawn in a 120×120 box facing right. Every moving part sits in its own
 * <g data-part="…"> so the renderer can animate position, head, eyes, wings and legs independently.
 */
export const FLY_VIEWBOX = 120;

export function flySvg(p: string): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="100%" height="100%" overflow="visible" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${p}-thorax" cx="38%" cy="28%" r="80%">
      <stop offset="0" stop-color="#EFDDB4"/><stop offset=".5" stop-color="#C9A56C"/><stop offset="1" stop-color="#80592C"/>
    </radialGradient>
    <radialGradient id="${p}-abd" cx="35%" cy="25%" r="85%">
      <stop offset="0" stop-color="#F0DDB0"/><stop offset=".55" stop-color="#D4B27A"/><stop offset="1" stop-color="#8A6232"/>
    </radialGradient>
    <radialGradient id="${p}-head" cx="40%" cy="30%" r="80%">
      <stop offset="0" stop-color="#EFD9A9"/><stop offset="1" stop-color="#A97D45"/>
    </radialGradient>
    <radialGradient id="${p}-eye" cx="36%" cy="30%" r="82%">
      <stop offset="0" stop-color="#F26B5C"/><stop offset=".42" stop-color="#C2342B"/><stop offset="1" stop-color="#6E1411"/>
    </radialGradient>
    <linearGradient id="${p}-wing" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".78"/>
      <stop offset=".55" stop-color="#F7E2BC" stop-opacity=".34"/>
      <stop offset="1" stop-color="#BFD779" stop-opacity=".2"/>
    </linearGradient>
    <radialGradient id="${p}-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#E0A04A" stop-opacity=".55"/><stop offset="1" stop-color="#E0A04A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${p}-shadow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#17140F" stop-opacity=".55"/><stop offset="1" stop-color="#17140F" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${p}-trail" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#E0A04A" stop-opacity="0"/><stop offset="1" stop-color="#E0A04A" stop-opacity=".7"/>
    </linearGradient>
    <clipPath id="${p}-abdclip"><ellipse cx="0" cy="0" rx="27" ry="17.5"/></clipPath>
    <clipPath id="${p}-thclip"><ellipse cx="0" cy="0" rx="18.5" ry="16"/></clipPath>
    <path id="${p}-wingpath" d="M0 0 C-16 -26 -46 -40 -70 -33 C-74 -20 -44 0 0 3 Z"/>
  </defs>

  <ellipse data-part="shadow" cx="62" cy="106" rx="22" ry="5.5" fill="url(#${p}-shadow)" opacity=".3"/>
  <path data-part="trail" d="" fill="none" stroke="url(#${p}-trail)" stroke-width="5" stroke-linecap="round" opacity="0"/>

  <g data-part="body">
    <circle data-part="glow" cx="60" cy="60" r="46" fill="url(#${p}-glow)" opacity="0"/>

    <!-- far wing & far legs -->
    <g data-part="wingFar" transform="translate(62 50)" opacity=".55">
      <use href="#${p}-wingpath" fill="url(#${p}-wing)" stroke="#CDB68A" stroke-opacity=".6" stroke-width=".7"/>
    </g>
    <g stroke="#6B4423" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".5">
      <path d="M58 72 L52 86 L50 98"/><path d="M67 73 L66 88 L69 99"/><path d="M76 71 L86 80 L93 87"/>
    </g>

    <!-- abdomen -->
    <g transform="translate(37 68) rotate(16)">
      <ellipse cx="0" cy="0" rx="27" ry="17.5" fill="url(#${p}-abd)"/>
      <g clip-path="url(#${p}-abdclip)" fill="#2F1B0E" opacity=".9">
        <path d="M-12 -19 Q-5 0 -12 19 L-8.2 19 Q-1.2 0 -8.2 -19Z"/>
        <path d="M-1 -19 Q6 0 -1 19 L3 19 Q10 0 3 -19Z"/>
        <path d="M10 -19 Q17 0 10 19 L14 19 Q21 0 14 -19Z"/>
        <path d="M-21 -19 Q-14 0 -21 19 L-30 19 L-30 -19Z"/>
      </g>
      <ellipse cx="-4" cy="-9.5" rx="14" ry="4.6" fill="#fff" opacity=".2"/>
    </g>

    <!-- thorax -->
    <g transform="translate(66 57)">
      <ellipse cx="0" cy="0" rx="18.5" ry="16" fill="url(#${p}-thorax)"/>
      <g clip-path="url(#${p}-thclip)" stroke="#5A3418" stroke-opacity=".6" stroke-width="1.6" fill="none" stroke-linecap="round">
        <path d="M-12 -17 Q-3 -2 -12 14"/><path d="M-4 -17 Q5 -2 -4 15"/>
      </g>
      <ellipse cx="-4" cy="-8" rx="10" ry="4.8" fill="#fff" opacity=".28"/>
    </g>

    <!-- near legs -->
    <g stroke="#4A2C14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M54 70 L46 85 L42 98"/><path d="M63 72 L60 89 L60 101"/>
      <g data-part="foreleg"><path d="M72 69 L80 81 L89 89"/><circle cx="89" cy="89" r="1.5" fill="#4A2C14" stroke="none"/></g>
    </g>
    <g fill="#4A2C14"><circle cx="42" cy="98" r="1.5"/><circle cx="60" cy="101" r="1.5"/></g>

    <!-- head group -->
    <g data-part="head">
      <path d="M84 49 Q96 46 97 58 Q96 70 84 69 Q76 60 84 49Z" fill="url(#${p}-head)"/>
      <ellipse data-part="eyeShape" cx="91" cy="56" rx="10.4" ry="11.4" fill="url(#${p}-eye)"/>
      <g data-part="ommatidia" opacity=".18" fill="#2a0806">
        <circle cx="86" cy="52" r=".7"/><circle cx="89" cy="50" r=".7"/><circle cx="92" cy="49.5" r=".7"/><circle cx="95" cy="52" r=".7"/>
        <circle cx="85.5" cy="57" r=".7"/><circle cx="96" cy="57" r=".7"/><circle cx="87" cy="62" r=".7"/><circle cx="91" cy="64" r=".7"/><circle cx="94.5" cy="62" r=".7"/>
      </g>
      <g data-part="pupilGroup">
        <ellipse data-part="pupil" cx="91" cy="56" rx="4.1" ry="4.6" fill="#220807"/>
      </g>
      <circle cx="87.4" cy="50.6" r="2.3" fill="#fff" opacity=".92"/>
      <circle cx="93.6" cy="60.6" r=".95" fill="#fff" opacity=".55"/>
      <ellipse data-part="lid" cx="91" cy="56" rx="10.9" ry="11.8" fill="url(#${p}-head)" transform="translate(0 45) scale(1 0) translate(0 -45)"/>
      <path d="M95.5 48 Q99 41.5 105 43" stroke="#6B3E1E" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M102.5 42.3 l1.3 -3.4 M104 43 l2.4 -2.6 M105 43.2 l3 -1" stroke="#6B3E1E" stroke-width=".9" stroke-linecap="round"/>
      <path d="M95 64 Q99.5 65 98.5 70" stroke="#8A5A2B" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </g>

    <!-- near wing (+ ghost for flap blur) -->
    <g data-part="wingGhost" transform="translate(62 50)" opacity="0">
      <use href="#${p}-wingpath" fill="url(#${p}-wing)"/>
    </g>
    <g data-part="wingNear" transform="translate(62 50)">
      <use href="#${p}-wingpath" fill="url(#${p}-wing)" stroke="#CDB68A" stroke-opacity=".75" stroke-width=".8"/>
      <g stroke="#B79A68" stroke-opacity=".55" stroke-width=".6" fill="none">
        <path d="M0 0 C-20 -15 -42 -23 -64 -30"/><path d="M-2 1 C-22 -7 -44 -10 -66 -24"/><path d="M-10 -10 C-18 -4 -26 0 -34 4"/>
      </g>
    </g>
  </g>

  <g data-part="sparks"></g>
  <g data-part="prop" opacity="0"></g>
</svg>`;
}

export const PROP_ART: Record<string, string> = {
  card: `<g><rect x="-17" y="-12" width="34" height="24" rx="4" fill="#FFFDF8" stroke="#E0A04A" stroke-width="1.4"/><path d="M-9 0 l5 5 l10 -10" stroke="#7a9a2a" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  report: `<g><rect x="-15" y="-16" width="30" height="32" rx="3.5" fill="#FFFDF8" stroke="#D9CDB5" stroke-width="1.2"/><g stroke="#C9BBA0" stroke-width="1.6" stroke-linecap="round"><path d="M-9 -8h18"/><path d="M-9 -2h18"/><path d="M-9 4h11"/></g><rect x="-9" y="8" width="8" height="4" rx="1.4" fill="#E0A04A"/></g>`,
  document: `<g><path d="M-14 -17h20l8 8v25a2 2 0 0 1-2 2h-26a2 2 0 0 1-2-2v-31a2 2 0 0 1 2-2z" fill="#FFFDF8" stroke="#D9CDB5" stroke-width="1.2"/><path d="M6 -17v8h8" fill="#F1E8D6" stroke="#D9CDB5" stroke-width="1.2"/><g stroke="#C9BBA0" stroke-width="1.6" stroke-linecap="round"><path d="M-8 0h16"/><path d="M-8 6h16"/><path d="M-8 12h9"/></g></g>`,
};
