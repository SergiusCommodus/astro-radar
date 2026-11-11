"""The words that group the space news (scripts/fetch_nasa.py group_of at build time; news.js in the browser reads the same two patterns from
the /news/ page, so the build and the page never group a headline differently). Both are plain regular expressions that Python and
JavaScript read alike, matched case insensitively: a headline with a LAUNCH word is a launch story; else one with a MISSION word (in the
headline or its first line) a mission story; else science and more."""
LAUNCH = (r"\b(launch\w*|lift\s?off|rocket\w*|booster\w*|falcon|starship|super heavy|new glenn|new shepard|vulcan|ariane|vega|electron|neutron|"
          r"long march|kuaizhou|soyuz|angara|proton|pslv|gslv|lvm3|h3|h\s?iia|firefly|static fire|scrub\w*|countdown|spaceport)\b")
MISSION = (r"\b(mission\w*|crew\w*|astronaut\w*|cosmonaut\w*|taikonaut\w*|space station|iss|tiangong|artemis|orion|dragon|starliner|"
           r"cygnus|progress|lander\w*|rover\w*|probe\w*|spacecraft|orbiter\w*|moon|lunar|mars|satellite\w*|spacewalk\w*|docking|docks?)\b")
