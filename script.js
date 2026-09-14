/* CookMatch v4 — multi-view + smart match + planner + shop */
const COOKMATCH_VERSION = "v12-whiskly";
console.log("Whiskly", COOKMATCH_VERSION);

/* ---------- Site SEO + Analytics ---------- */
const SITE_ORIGIN = (typeof location !== "undefined" && location.origin && !location.origin.startsWith("file:"))
  ? location.origin
  : "https://whiskly.whatcanieat.workers.dev";

function slugify(name) {
  return String(name || "recipe")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "recipe";
}

function trackEvent(name, params = {}) {
  try {
    if (typeof gtag === "function") {
      gtag("event", name, { ...params, app: "whiskly" });
    }
  } catch (e) {}
  try {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      console.debug("[analytics]", name, params);
    }
  } catch (e) {}
}

function setPageMeta({ title, description, path, image }) {
  const fullTitle = title ? (title.includes("Whiskly") ? title : `${title} · Whiskly`) : "Whiskly";
  document.title = fullTitle;
  const desc = description || "Find recipes from your ingredients, plan meals, and build a grocery list.";
  const url = SITE_ORIGIN + (path || location.pathname || "/");
  const img = image || (SITE_ORIGIN + "/og-image.svg");

  const set = (sel, attr, val) => {
    const el = document.querySelector(sel);
    if (el) el.setAttribute(attr, val);
  };
  set('meta[name="description"]', "content", desc);
  set("#canonicalLink", "href", url);
  set("#ogTitle", "content", fullTitle);
  set("#ogDescription", "content", desc);
  set("#ogUrl", "content", url);
  set("#ogImage", "content", img);
  set("#twTitle", "content", fullTitle);
  set("#twDescription", "content", desc);
  set("#twImage", "content", img);

  try {
    if (typeof gtag === "function") {
      gtag("event", "page_view", {
        page_title: fullTitle,
        page_location: url,
        page_path: path || location.pathname
      });
    }
  } catch (e) {}
}

/** Google-rich Recipe JSON-LD for Search Console / rich results */
function setRecipeSchema(meal, path) {
  const el = document.getElementById("schema-recipe");
  if (!el) return;
  if (!meal) {
    el.textContent = "";
    return;
  }
  const url = SITE_ORIGIN + (path || recipePath(meal));
  const image = meal.image || meal.fallbackImage || (SITE_ORIGIN + "/og-image.svg");
  const ingredients = Array.isArray(meal.ingredients)
    ? meal.ingredients.map(i => (typeof i === "string" ? i : (i.name || i.item || String(i)))).filter(Boolean)
    : [];
  const instructions = Array.isArray(meal.steps)
    ? meal.steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        text: typeof s === "string" ? s : (s.text || s.step || String(s))
      }))
    : [];
  const schema = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: meal.name,
    url,
    image: [image],
    description: `Recipe for ${meal.name}${meal.time ? ` · ${meal.time} min` : ""}`,
    recipeCategory: meal.type || "Dinner",
    recipeCuisine: (meal.dietTags && meal.dietTags[0]) || undefined,
    prepTime: meal.time ? `PT${Math.max(1, Math.round(meal.time * 0.3))}M` : undefined,
    cookTime: meal.time ? `PT${Math.max(1, Math.round(meal.time * 0.7))}M` : undefined,
    totalTime: meal.time ? `PT${Math.round(meal.time)}M` : undefined,
    recipeYield: String(meal.baseServings || meal.servings || 4),
    recipeIngredient: ingredients.length ? ingredients : undefined,
    recipeInstructions: instructions.length ? instructions : undefined,
    nutrition: (meal.cal != null || meal.protein != null) ? {
      "@type": "NutritionInformation",
      calories: meal.cal != null ? `${Math.round(meal.cal)} calories` : undefined,
      proteinContent: meal.protein != null ? `${Math.round(meal.protein)} g` : undefined,
      carbohydrateContent: meal.carbs != null ? `${Math.round(meal.carbs)} g` : undefined,
      fatContent: meal.fat != null ? `${Math.round(meal.fat)} g` : undefined
    } : undefined,
    author: { "@type": "Organization", name: "Whiskly" }
  };
  // Strip undefined keys for cleaner JSON
  const clean = (obj) => {
    if (Array.isArray(obj)) return obj.map(clean).filter(v => v !== undefined);
    if (obj && typeof obj === "object") {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === undefined) continue;
        out[k] = clean(v);
      }
      return out;
    }
    return obj;
  };
  el.textContent = JSON.stringify(clean(schema));
}

function clearRecipeSchema() {
  setRecipeSchema(null);
}

const VIEW_META = {
  home: {
    title: "Whiskly — Find recipes from your ingredients",
    description: "Tell Whiskly what you have in the kitchen and get matching recipes, nutrition info, and meal ideas.",
    path: "/"
  },
  search: {
    title: "Search recipes by name",
    description: "Browse and search the Whiskly recipe library by dish name, diet, time, and nutrition goals.",
    path: "/recipes"
  },
  planner: {
    title: "Weekly meal planner",
    description: "Build a balanced weekly meal plan near your calorie and protein targets, then save it on this device.",
    path: "/meal-plan"
  },
  shop: {
    title: "Grocery list",
    description: "Generate a grocery list from your meal plan with quantities, then check items off as you shop.",
    path: "/grocery"
  },
  favorites: {
    title: "Favorite recipes",
    description: "Your saved favorite recipes on this device — reopen them anytime.",
    path: "/favorites"
  }
};

const PATH_TO_VIEW = {
  "/": "home",
  "/recipes": "search",
  "/meal-plan": "planner",
  "/grocery": "planner",
  "/favorites": "favorites"
};

function navigateTo(path, { replace = false } = {}) {
  const url = path.startsWith("http") ? path : (path.startsWith("/") ? path : "/" + path);
  try {
    if (replace) history.replaceState({ path: url }, "", url);
    else history.pushState({ path: url }, "", url);
  } catch (e) {}
}

function recipePath(meal) {
  if (!meal) return "/recipes";
  const slug = slugify(meal.name);
  return `/recipes/${slug}-${meal.id}`;
}

function parseRecipePath(pathname) {
  const m = String(pathname || "").match(/^\/recipes\/(?:.+-)?(\d+)\/?$/);
  if (m) return m[1];
  const m2 = String(pathname || "").match(/^\/recipes\/([^/]+)\/?$/);
  if (m2 && /^\d+$/.test(m2[1])) return m2[1];
  return null;
}



const SUPABASE_URL = "https://aaptmaduicanorkaqicn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Xy9_pX_zqG6-UvTcfEeT9w_v90Kuw35";
const TABLE_NAME = "food_items_final";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ingredientAliases = {
  egg:"egg",eggs:"egg",tomato:"tomato",tomatoes:"tomato",potato:"potato",potatoes:"potato",
  pasta:"pasta",pastas:"pasta",rice:"rice",rices:"rice",chicken:"chicken",chickens:"chicken",
  onion:"onion",onions:"onion",pepper:"pepper",peppers:"pepper",cheese:"cheese",cheeses:"cheese",
  yogurt:"yogurt",yogurts:"yogurt","greek yogurt":"yogurt",tortilla:"tortilla",tortillas:"tortilla",
  avocado:"avocado",avocados:"avocado",lentil:"lentil",lentils:"lentil",bean:"bean",beans:"bean",
  tuna:"tuna",turkey:"turkey",beef:"beef","ground beef":"beef",salmon:"salmon",fish:"fish",
  spinach:"spinach",broccoli:"broccoli",mushroom:"mushroom",mushrooms:"mushroom",corn:"corn",
  pea:"pea",peas:"pea",carrot:"carrot",carrots:"carrot",garlic:"garlic",lemon:"lemon",
  chickpea:"chickpea",chickpeas:"chickpea",hummus:"hummus",oat:"oat",oats:"oat",
  banana:"banana",bananas:"banana",bread:"bread",noodle:"noodle",noodles:"noodle"
};

const FALLBACK_IMAGES = {
  potato:"https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=1600&q=85&auto=format",
  pasta:"https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=1600&q=85&auto=format",
  rice:"https://images.unsplash.com/photo-1512058564366-18510be2db19?w=1600&q=85&auto=format",
  chicken:"https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=1600&q=85&auto=format",
  beef:"https://images.unsplash.com/photo-1544025162-d76694265947?w=1600&q=85&auto=format",
  fish:"https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1600&q=85&auto=format",
  tuna:"https://images.unsplash.com/photo-1547592180-85f173990554?w=1600&q=85&auto=format",
  egg:"https://images.unsplash.com/photo-1525351484163-7529414344d8?w=1600&q=85&auto=format",
  bread:"https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1600&q=85&auto=format",
  vegetable:"https://images.unsplash.com/photo-1540420773420-3366772f4999?w=1600&q=85&auto=format",
  dessert:"https://images.unsplash.com/photo-1551024506-0bccd828d307?w=1600&q=85&auto=format",
  food:"https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1600&q=85&auto=format"
};

/* Expanded nutrition DB — values per 100g (mixed sources: USDA + common food tables) */
const USDA = {
  // Proteins
  chicken_breast:{cal:165,protein:31,carbs:0,fat:3.6,unitG:{oz:28,lb:454,g:1,piece:120,breast:170}},
  chicken_thigh:{cal:209,protein:26,carbs:0,fat:10.9,unitG:{oz:28,lb:454,g:1,thigh:100}},
  chicken_whole:{cal:215,protein:27,carbs:0,fat:11,unitG:{oz:28,lb:454,g:1,whole:1400}},
  chicken_wing:{cal:203,protein:30,carbs:0,fat:8.1,unitG:{oz:28,piece:30,g:1}},
  turkey:{cal:189,protein:29,carbs:0,fat:7,unitG:{oz:28,lb:454,g:1}},
  beef_ground:{cal:254,protein:25,carbs:0,fat:17,unitG:{oz:28,lb:454,g:1}},
  beef_steak:{cal:271,protein:25,carbs:0,fat:19,unitG:{oz:28,lb:454,g:1,steak:200}},
  beef_roast:{cal:250,protein:27,carbs:0,fat:15,unitG:{oz:28,lb:454,g:1}},
  pork:{cal:242,protein:27,carbs:0,fat:14,unitG:{oz:28,lb:454,g:1}},
  pork_ribs:{cal:277,protein:20,carbs:0,fat:21,unitG:{oz:28,lb:454,g:1,rack:1800}},
  pork_chop:{cal:231,protein:24,carbs:0,fat:14,unitG:{oz:28,lb:454,g:1,chop:150}},
  bacon:{cal:541,protein:37,carbs:1.4,fat:42,unitG:{slice:8,oz:28,g:1}},
  sausage:{cal:301,protein:12,carbs:2,fat:27,unitG:{oz:28,link:50,g:1}},
  ham:{cal:145,protein:21,carbs:1.5,fat:5.5,unitG:{oz:28,slice:28,g:1}},
  lamb:{cal:294,protein:25,carbs:0,fat:21,unitG:{oz:28,lb:454,g:1}},
  salmon:{cal:208,protein:20,carbs:0,fat:13,unitG:{oz:28,fillet:150,g:1}},
  tuna:{cal:132,protein:28,carbs:0,fat:1.3,unitG:{oz:28,can:140,g:1}},
  fish:{cal:120,protein:22,carbs:0,fat:3,unitG:{oz:28,fillet:140,g:1}},
  cod:{cal:82,protein:18,carbs:0,fat:0.7,unitG:{oz:28,fillet:150,g:1}},
  shrimp:{cal:99,protein:24,carbs:0.2,fat:0.3,unitG:{oz:28,cup:100,g:1}},
  crab:{cal:97,protein:19,carbs:0,fat:1.5,unitG:{oz:28,cup:135,g:1}},
  lobster:{cal:89,protein:19,carbs:0,fat:0.9,unitG:{oz:28,g:1}},
  egg:{cal:143,protein:13,carbs:0.7,fat:9.5,unitG:{large:50,medium:44,g:1}},
  egg_white:{cal:52,protein:11,carbs:0.7,fat:0.2,unitG:{large:33,g:1}},
  tofu:{cal:76,protein:8,carbs:1.9,fat:4.8,unitG:{oz:28,g:1,cup:250}},
  tempeh:{cal:193,protein:19,carbs:9,fat:11,unitG:{oz:28,g:1}},
  // Dairy
  milk_whole:{cal:61,protein:3.2,carbs:4.8,fat:3.3,unitG:{cup:244,tbsp:15,g:1}},
  milk_skim:{cal:34,protein:3.4,carbs:5,fat:0.1,unitG:{cup:245,g:1}},
  cream:{cal:340,protein:2.1,carbs:2.8,fat:36,unitG:{cup:238,tbsp:15,g:1}},
  heavy_cream:{cal:340,protein:2.1,carbs:2.8,fat:36,unitG:{cup:238,tbsp:15,g:1}},
  sour_cream:{cal:193,protein:2.4,carbs:4.6,fat:20,unitG:{cup:230,tbsp:12,g:1}},
  butter:{cal:717,protein:0.9,carbs:0.1,fat:81,unitG:{tbsp:14,stick:113,g:1}},
  cheese_cheddar:{cal:403,protein:25,carbs:1.3,fat:33,unitG:{oz:28,cup:113,g:1}},
  cheese_generic:{cal:350,protein:22,carbs:2,fat:28,unitG:{oz:28,g:1}},
  mozzarella:{cal:280,protein:28,carbs:3.1,fat:17,unitG:{oz:28,cup:112,g:1}},
  parmesan:{cal:431,protein:38,carbs:4,fat:29,unitG:{oz:28,cup:100,tbsp:5,g:1}},
  feta:{cal:264,protein:14,carbs:4,fat:21,unitG:{oz:28,cup:150,g:1}},
  cream_cheese:{cal:342,protein:6,carbs:4,fat:34,unitG:{oz:28,tbsp:15,g:1}},
  ricotta:{cal:174,protein:11,carbs:3,fat:13,unitG:{cup:246,oz:28,g:1}},
  yogurt:{cal:59,protein:10,carbs:3.6,fat:0.4,unitG:{cup:245,g:1}},
  greek_yogurt:{cal:59,protein:10,carbs:3.6,fat:0.4,unitG:{cup:245,g:1}},
  ice_cream:{cal:207,protein:3.5,carbs:24,fat:11,unitG:{cup:132,g:1}},
  // Grains & starches
  pasta:{cal:371,protein:13,carbs:75,fat:1.5,unitG:{oz:28,cup:100,g:1,lb:454}},
  pasta_cooked:{cal:131,protein:5,carbs:25,fat:1.1,unitG:{cup:140,oz:28,g:1}},
  rice:{cal:365,protein:7.1,carbs:80,fat:0.7,unitG:{cup:185,oz:28,g:1}},
  rice_cooked:{cal:130,protein:2.7,carbs:28,fat:0.3,unitG:{cup:158,g:1}},
  potato:{cal:77,protein:2,carbs:17,fat:0.1,unitG:{medium:173,large:300,oz:28,lb:454,g:1}},
  sweet_potato:{cal:86,protein:1.6,carbs:20,fat:0.1,unitG:{medium:130,g:1}},
  bread:{cal:265,protein:9,carbs:49,fat:3.2,unitG:{slice:30,g:1}},
  flour_tortilla:{cal:237,protein:6,carbs:40,fat:5,unitG:{piece:50,g:1}},
  oats:{cal:389,protein:17,carbs:66,fat:7,unitG:{cup:81,oz:28,g:1}},
  quinoa:{cal:120,protein:4.4,carbs:21,fat:1.9,unitG:{cup:185,oz:28,g:1}},
  couscous:{cal:112,protein:3.8,carbs:23,fat:0.2,unitG:{cup:157,g:1}},
  flour:{cal:364,protein:10,carbs:76,fat:1,unitG:{cup:125,tbsp:8,g:1}},
  cornstarch:{cal:381,protein:0.3,carbs:91,fat:0.1,unitG:{tbsp:8,g:1}},
  breadcrumb:{cal:395,protein:13,carbs:72,fat:5,unitG:{cup:108,g:1}},
  // Legumes
  bean:{cal:127,protein:8.7,carbs:23,fat:0.5,unitG:{cup:180,can:240,g:1}},
  black_bean:{cal:132,protein:8.9,carbs:24,fat:0.5,unitG:{cup:172,can:240,g:1}},
  lentil:{cal:116,protein:9,carbs:20,fat:0.4,unitG:{cup:200,g:1}},
  chickpea:{cal:164,protein:8.9,carbs:27,fat:2.6,unitG:{cup:164,can:240,g:1}},
  pea:{cal:81,protein:5.4,carbs:14,fat:0.4,unitG:{cup:160,g:1}},
  edamame:{cal:121,protein:12,carbs:9,fat:5,unitG:{cup:155,g:1}},
  // Vegetables (COUNT THESE)
  onion:{cal:40,protein:1.1,carbs:9.3,fat:0.1,unitG:{medium:110,large:150,g:1}},
  garlic:{cal:149,protein:6.4,carbs:33,fat:0.5,unitG:{clove:3,g:1}},
  tomato:{cal:18,protein:0.9,carbs:3.9,fat:0.2,unitG:{medium:123,cup:180,g:1}},
  cherry_tomato:{cal:18,protein:0.9,carbs:3.9,fat:0.2,unitG:{cup:149,g:1}},
  spinach:{cal:23,protein:2.9,carbs:3.6,fat:0.4,unitG:{cup:30,g:1}},
  kale:{cal:49,protein:4.3,carbs:9,fat:0.9,unitG:{cup:67,g:1}},
  lettuce:{cal:15,protein:1.4,carbs:2.9,fat:0.2,unitG:{cup:36,head:300,g:1}},
  broccoli:{cal:34,protein:2.8,carbs:7,fat:0.4,unitG:{cup:91,g:1}},
  cauliflower:{cal:25,protein:1.9,carbs:5,fat:0.3,unitG:{cup:100,g:1}},
  carrot:{cal:41,protein:0.9,carbs:10,fat:0.2,unitG:{medium:61,cup:128,g:1}},
  celery:{cal:14,protein:0.7,carbs:3,fat:0.2,unitG:{stalk:40,cup:101,g:1}},
  bell_pepper:{cal:31,protein:1,carbs:6,fat:0.3,unitG:{medium:120,cup:149,g:1}},
  jalapeno:{cal:29,protein:0.9,carbs:6.5,fat:0.4,unitG:{pepper:14,g:1}},
  mushroom:{cal:22,protein:3.1,carbs:3.3,fat:0.3,unitG:{cup:70,g:1}},
  zucchini:{cal:17,protein:1.2,carbs:3.1,fat:0.3,unitG:{medium:196,cup:124,g:1}},
  cucumber:{cal:15,protein:0.7,carbs:3.6,fat:0.1,unitG:{medium:300,g:1}},
  cabbage:{cal:25,protein:1.3,carbs:6,fat:0.1,unitG:{cup:89,g:1}},
  corn:{cal:86,protein:3.3,carbs:19,fat:1.2,unitG:{cup:166,ear:90,g:1}},
  asparagus:{cal:20,protein:2.2,carbs:3.9,fat:0.1,unitG:{spear:12,cup:134,g:1}},
  green_bean:{cal:31,protein:1.8,carbs:7,fat:0.1,unitG:{cup:100,g:1}},
  eggplant:{cal:25,protein:1,carbs:6,fat:0.2,unitG:{cup:82,medium:550,g:1}},
  squash:{cal:16,protein:0.6,carbs:3.4,fat:0.1,unitG:{cup:116,g:1}},
  butternut:{cal:45,protein:1,carbs:12,fat:0.1,unitG:{cup:140,g:1}},
  acorn_squash:{cal:40,protein:0.8,carbs:10,fat:0.1,unitG:{cup:100,g:1}},
  beet:{cal:43,protein:1.6,carbs:10,fat:0.2,unitG:{cup:170,g:1}},
  radish:{cal:16,protein:0.7,carbs:3.4,fat:0.1,unitG:{cup:116,g:1}},
  avocado:{cal:160,protein:2,carbs:8.5,fat:15,unitG:{medium:150,g:1}},
  olive:{cal:115,protein:0.8,carbs:6,fat:11,unitG:{cup:135,piece:4,g:1}},
  ginger:{cal:80,protein:1.8,carbs:18,fat:0.8,unitG:{tbsp:6,inch:5,g:1}},
  scallion:{cal:32,protein:1.8,carbs:7,fat:0.2,unitG:{stalk:15,cup:100,g:1}},
  shallot:{cal:72,protein:2.5,carbs:17,fat:0.1,unitG:{medium:25,g:1}},
  leek:{cal:61,protein:1.5,carbs:14,fat:0.3,unitG:{medium:89,cup:89,g:1}},
  fennel:{cal:31,protein:1.2,carbs:7,fat:0.2,unitG:{cup:87,g:1}},
  artichoke:{cal:47,protein:3.3,carbs:11,fat:0.2,unitG:{medium:128,g:1}},
  // Fruit
  lemon:{cal:29,protein:1.1,carbs:9.3,fat:0.3,unitG:{medium:60,tbsp:15,g:1}},
  lime:{cal:30,protein:0.7,carbs:11,fat:0.2,unitG:{medium:67,tbsp:15,g:1}},
  orange:{cal:47,protein:0.9,carbs:12,fat:0.1,unitG:{medium:130,g:1}},
  apple:{cal:52,protein:0.3,carbs:14,fat:0.2,unitG:{medium:182,g:1}},
  banana:{cal:89,protein:1.1,carbs:23,fat:0.3,unitG:{medium:118,g:1}},
  berry:{cal:57,protein:0.7,carbs:14,fat:0.3,unitG:{cup:140,g:1}},
  strawberry:{cal:32,protein:0.7,carbs:8,fat:0.3,unitG:{cup:152,g:1}},
  blueberry:{cal:57,protein:0.7,carbs:14,fat:0.3,unitG:{cup:148,g:1}},
  grape:{cal:69,protein:0.7,carbs:18,fat:0.2,unitG:{cup:151,g:1}},
  mango:{cal:60,protein:0.8,carbs:15,fat:0.4,unitG:{cup:165,g:1}},
  pineapple:{cal:50,protein:0.5,carbs:13,fat:0.1,unitG:{cup:165,g:1}},
  coconut:{cal:354,protein:3.3,carbs:15,fat:33,unitG:{cup:80,g:1}},
  raisin:{cal:299,protein:3.1,carbs:79,fat:0.5,unitG:{cup:145,g:1}},
  // Fats, oils, pantry (COUNT oils/butter/sugar/flour)
  olive_oil:{cal:884,protein:0,carbs:0,fat:100,unitG:{tbsp:14,tsp:4.5,g:1}},
  oil:{cal:884,protein:0,carbs:0,fat:100,unitG:{tbsp:14,tsp:4.5,g:1}},
  coconut_oil:{cal:862,protein:0,carbs:0,fat:100,unitG:{tbsp:14,g:1}},
  sesame_oil:{cal:884,protein:0,carbs:0,fat:100,unitG:{tbsp:14,tsp:4.5,g:1}},
  mayo:{cal:680,protein:1,carbs:0.6,fat:75,unitG:{tbsp:14,g:1}},
  peanut_butter:{cal:588,protein:25,carbs:20,fat:50,unitG:{tbsp:16,g:1}},
  almond_butter:{cal:614,protein:21,carbs:19,fat:56,unitG:{tbsp:16,g:1}},
  sugar:{cal:387,protein:0,carbs:100,fat:0,unitG:{cup:200,tbsp:12,tsp:4,g:1}},
  brown_sugar:{cal:380,protein:0,carbs:98,fat:0,unitG:{cup:220,tbsp:14,g:1}},
  honey:{cal:304,protein:0.3,carbs:82,fat:0,unitG:{tbsp:21,tsp:7,g:1}},
  maple_syrup:{cal:260,protein:0,carbs:67,fat:0,unitG:{tbsp:20,g:1}},
  chocolate:{cal:546,protein:4.9,carbs:61,fat:31,unitG:{oz:28,cup:170,g:1}},
  cocoa:{cal:228,protein:20,carbs:58,fat:14,unitG:{tbsp:5,cup:86,g:1}},
  // Nuts & seeds
  almond:{cal:579,protein:21,carbs:22,fat:50,unitG:{oz:28,cup:143,g:1}},
  walnut:{cal:654,protein:15,carbs:14,fat:65,unitG:{oz:28,cup:117,g:1}},
  peanut:{cal:567,protein:26,carbs:16,fat:49,unitG:{oz:28,cup:146,g:1}},
  cashew:{cal:553,protein:18,carbs:30,fat:44,unitG:{oz:28,cup:129,g:1}},
  sesame:{cal:573,protein:18,carbs:23,fat:50,unitG:{tbsp:9,g:1}},
  chia:{cal:486,protein:17,carbs:42,fat:31,unitG:{tbsp:10,g:1}},
  // Sauces & liquids
  stock:{cal:10,protein:1,carbs:1,fat:0.3,unitG:{cup:240,g:1}},
  chicken_stock:{cal:10,protein:1,carbs:1,fat:0.3,unitG:{cup:240,g:1}},
  tomato_sauce:{cal:29,protein:1.5,carbs:6,fat:0.2,unitG:{cup:245,g:1}},
  tomato_paste:{cal:82,protein:4.3,carbs:19,fat:0.5,unitG:{tbsp:16,can:170,g:1}},
  coconut_milk:{cal:230,protein:2.3,carbs:6,fat:24,unitG:{cup:240,g:1,tbsp:15}},
  soy_sauce:{cal:53,protein:8,carbs:5,fat:0.1,unitG:{tbsp:16,tsp:5,g:1}},
  ketchup:{cal:112,protein:1.3,carbs:26,fat:0.2,unitG:{tbsp:17,g:1}},
  mustard:{cal:60,protein:4,carbs:6,fat:3,unitG:{tbsp:15,g:1}},
  wine:{cal:83,protein:0.1,carbs:2.6,fat:0,unitG:{cup:240,tbsp:15,g:1}},
  vinegar:{cal:18,protein:0,carbs:0.9,fat:0,unitG:{tbsp:15,tsp:5,g:1}},
  miso:{cal:199,protein:12,carbs:25,fat:6,unitG:{tbsp:17,g:1}},
  // Tiny pantry (still counted when quantity present)
  salt:{cal:0,protein:0,carbs:0,fat:0,unitG:{tsp:6,g:1}},
  herb:{cal:40,protein:3,carbs:7,fat:0.8,unitG:{tbsp:3,tsp:1,g:1}},
  spice:{cal:280,protein:10,carbs:50,fat:10,unitG:{tsp:2,tbsp:6,g:1}},
  pepper_black:{cal:251,protein:10,carbs:64,fat:3,unitG:{tsp:2,g:1}},
  water:{cal:0,protein:0,carbs:0,fat:0,unitG:{cup:240,g:1}}
};

const INGREDIENT_MAP = [
  [/chicken thigh|skinless.*chicken thigh/i,"chicken_thigh"],[/whole chicken|roast chicken/i,"chicken_whole"],[/chicken wing/i,"chicken_wing"],[/chicken/i,"chicken_breast"],
  [/turkey/i,"turkey"],[/ground beef|beef mince|minced beef/i,"beef_ground"],[/steak|beef roast|beef/i,"beef_steak"],[/bacon/i,"bacon"],[/sausage/i,"sausage"],[/ham\b/i,"ham"],
  [/sparerib|spare rib|pork rib|baby back/i,"pork_ribs"],[/pork chop/i,"pork_chop"],[/pork/i,"pork"],[/lamb/i,"lamb"],
  [/salmon/i,"salmon"],[/tuna/i,"tuna"],[/cod|haddock|halibut/i,"cod"],[/shrimp|prawn/i,"shrimp"],[/crab/i,"crab"],[/lobster/i,"lobster"],[/fish/i,"fish"],
  [/egg white/i,"egg_white"],[/egg/i,"egg"],[/tempeh/i,"tempeh"],[/tofu/i,"tofu"],
  [/skim milk|nonfat milk/i,"milk_skim"],[/milk/i,"milk_whole"],[/heavy cream|whipping cream/i,"heavy_cream"],[/sour cream/i,"sour_cream"],[/cream/i,"cream"],
  [/butter|ghee/i,"butter"],[/parmesan|parmigiano/i,"parmesan"],[/mozzarella/i,"mozzarella"],[/feta/i,"feta"],[/cream cheese/i,"cream_cheese"],[/ricotta/i,"ricotta"],
  [/cheddar/i,"cheese_cheddar"],[/cheese/i,"cheese_generic"],[/greek yogurt/i,"greek_yogurt"],[/yogurt|yoghurt/i,"yogurt"],[/ice cream/i,"ice_cream"],
  [/pasta|macaroni|noodle|spaghetti|penne|linguine|fettuccine|rigatoni/i,"pasta"],[/rice/i,"rice"],[/sweet potato/i,"sweet_potato"],[/potato/i,"potato"],
  [/tortilla/i,"flour_tortilla"],[/bread|toast|baguette/i,"bread"],[/oat|oatmeal/i,"oats"],[/quinoa/i,"quinoa"],[/couscous/i,"couscous"],[/flour/i,"flour"],[/breadcrumb|panko/i,"breadcrumb"],[/cornstarch|corn starch/i,"cornstarch"],
  [/black bean/i,"black_bean"],[/chickpea|garbanzo/i,"chickpea"],[/lentil|dal/i,"lentil"],[/edamame/i,"edamame"],[/\bpeas?\b/i,"pea"],[/\bbeans?\b/i,"bean"],
  [/onion|shallot/i,"onion"],[/garlic/i,"garlic"],[/cherry tomato/i,"cherry_tomato"],[/tomato paste/i,"tomato_paste"],[/tomato sauce|marinara/i,"tomato_sauce"],[/tomato/i,"tomato"],
  [/spinach|kale/i,"spinach"],[/kale/i,"kale"],[/lettuce|romaine|arugula/i,"lettuce"],[/broccoli/i,"broccoli"],[/cauliflower/i,"cauliflower"],
  [/carrot/i,"carrot"],[/celery/i,"celery"],[/bell pepper|capsicum|red pepper|green pepper|yellow pepper/i,"bell_pepper"],[/jalape[nñ]o|jalapeno|chili pepper/i,"jalapeno"],
  [/mushroom/i,"mushroom"],[/zucchini|courgette/i,"zucchini"],[/cucumber/i,"cucumber"],[/cabbage/i,"cabbage"],[/\bcorn\b/i,"corn"],
  [/asparagus/i,"asparagus"],[/green bean|string bean/i,"green_bean"],[/eggplant|aubergine/i,"eggplant"],[/butternut/i,"butternut"],[/acorn squash/i,"acorn_squash"],[/squash/i,"squash"],
  [/beet/i,"beet"],[/radish/i,"radish"],[/avocado/i,"avocado"],[/olive(?!\s*oil)/i,"olive"],[/ginger/i,"ginger"],[/scallion|green onion|spring onion/i,"scallion"],[/leek/i,"leek"],[/fennel/i,"fennel"],[/artichoke/i,"artichoke"],
  [/lemon/i,"lemon"],[/lime/i,"lime"],[/orange/i,"orange"],[/apple/i,"apple"],[/banana/i,"banana"],[/strawberr/i,"strawberry"],[/blueberr/i,"blueberry"],[/berr/i,"berry"],[/grape/i,"grape"],[/mango/i,"mango"],[/pineapple/i,"pineapple"],[/coconut milk/i,"coconut_milk"],[/coconut/i,"coconut"],[/raisin/i,"raisin"],
  [/olive oil/i,"olive_oil"],[/sesame oil/i,"sesame_oil"],[/coconut oil/i,"coconut_oil"],[/oil/i,"oil"],[/mayonnaise|mayo/i,"mayo"],[/peanut butter/i,"peanut_butter"],[/almond butter/i,"almond_butter"],
  [/brown sugar/i,"brown_sugar"],[/sugar/i,"sugar"],[/maple syrup/i,"maple_syrup"],[/honey/i,"honey"],[/chocolate/i,"chocolate"],[/cocoa|cacao/i,"cocoa"],
  [/almond/i,"almond"],[/walnut/i,"walnut"],[/peanut/i,"peanut"],[/cashew/i,"cashew"],[/sesame/i,"sesame"],[/chia/i,"chia"],
  [/chicken stock|chicken broth/i,"chicken_stock"],[/stock|broth/i,"stock"],[/soy sauce|tamari/i,"soy_sauce"],[/ketchup/i,"ketchup"],[/mustard/i,"mustard"],[/wine/i,"wine"],[/vinegar/i,"vinegar"],[/miso/i,"miso"],
  [/black pepper/i,"pepper_black"],[/salt/i,"salt"],[/sage|rosemary|thyme|parsley|basil|cilantro|herb/i,"herb"],[/cumin|paprika|cinnamon|spice|chili powder/i,"spice"],[/water/i,"water"]
];


let meals = [], selectedIngredients = [], saved = [], rankedResults = [];
let currentPage = 0, PAGE_SIZE = 60;
const MAX_RESULTS = 10000;
let hasMore = true, isLoading = false, dataReady = false;
let matchMode = "similar"; // similar | flexible | exact
let homeGoal = "any", homeHunger = "normal";
let weeklyPlanData = []; // structured plan for shop list
let shopItems = [];
let shopViewMode = "days"; // days | merged
let nameSearchPage = 0;
let nameSearchQuery = "";
let nameSearchHasMore = false;
let nameResults = [];
let preferMyIngredients = false;
let viewHistory = ["home"];
let lastNonRecipeView = "home";

try { saved = JSON.parse(localStorage.getItem("wcieSaved")||"[]").map(String); } catch { saved = []; }
try {
  const _shopRaw = localStorage.getItem("wcieShop");
  if (_shopRaw) {
    const _shopParsed = JSON.parse(_shopRaw);
    if (Array.isArray(_shopParsed)) shopItems = _shopParsed;
    else if (_shopParsed && Array.isArray(_shopParsed.items)) shopItems = _shopParsed.items;
    else shopItems = [];
  } else shopItems = [];
} catch { shopItems = []; }

const $ = id => document.getElementById(id);
const normalizeText = v => String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9\s-]/g," ").replace(/\s+/g," ").trim();
const normalizeIngredient = v => { const x = normalizeText(v); return ingredientAliases[x]||x; };

/* ---------- Ingredient families (synonyms) ---------- */
const INGREDIENT_FAMILIES = {
  pasta: ["pasta","spaghetti","penne","linguine","fusilli","macaroni","capellini","rigatoni","fettuccine","tagliatelle","farfalle","orzo","ziti","ditali","mezzani","angel hair","lasagna","lasagne","noodle pasta","egg noodle","egg noodles"],
  noodle: ["noodle","noodles","ramen","somen","rice noodle","rice noodles","udon","soba"],
  chicken: ["chicken","chicken breast","chicken thigh","chicken tenderloin","chicken pieces","chicken tenders","rotisserie chicken","chicken leg","chicken wing"],
  beef: ["beef","ground beef","steak","sirloin","ribeye","minced beef","beef mince","brisket","chuck"],
  pork: ["pork","pork chop","pork loin","pork shoulder","bacon","ham","prosciutto","pancetta"],
  turkey: ["turkey","ground turkey","turkey breast"],
  tuna: ["tuna","canned tuna","tuna steak"],
  salmon: ["salmon","smoked salmon"],
  fish: ["fish","cod","tilapia","white fish","haddock","halibut","trout"],
  egg: ["egg","eggs","egg white","egg yolk"],
  rice: ["rice","white rice","brown rice","jasmine rice","basmati","arborio","wild rice"],
  potato: ["potato","potatoes","new potato","baby potato","russet","yukon","sweet potato"],
  tomato: ["tomato","tomatoes","cherry tomato","roma tomato","crushed tomato","tomato paste","canned tomato","sun dried tomato"],
  onion: ["onion","onions","red onion","yellow onion","white onion","shallot","scallion","green onion","leek"],
  garlic: ["garlic","garlic clove","garlic cloves","garlic powder"],
  // Cheese family — searching "cheese" matches any of these
  cheese: ["cheese","parmesan","parmigiano","cheddar","mozzarella","pecorino","ricotta","feta","gouda","swiss","provolone","brie","camembert","blue cheese","goat cheese","cream cheese","mascarpone","gruyere","monterey jack","pepper jack","american cheese","cottage cheese"],
  // Milk / dairy family
  milk: ["milk","whole milk","skim milk","2% milk","almond milk","oat milk","soy milk","coconut milk","evaporated milk","condensed milk"],
  cream: ["cream","heavy cream","whipping cream","sour cream","creme fraiche","half and half","double cream"],
  butter: ["butter","ghee","clarified butter","margarine"],
  yogurt: ["yogurt","greek yogurt","plain yogurt","yoghurt"],
  oil: ["oil","olive oil","vegetable oil","canola oil","sesame oil","coconut oil","avocado oil","sunflower oil"],
  bread: ["bread","toast","baguette","sourdough","ciabatta","pita","tortilla","flatbread","naan","bun","roll"],
  spinach: ["spinach","baby spinach","kale","chard","greens"],
  broccoli: ["broccoli","broccolini"],
  carrot: ["carrot","carrots"],
  pepper: ["bell pepper","red pepper","green pepper","yellow pepper","capsicum","chili","chilli","jalapeno"],
  mushroom: ["mushroom","mushrooms","shiitake","portobello","cremini","button mushroom"],
  bean: ["bean","beans","black bean","kidney bean","pinto bean","navy bean","white bean","cannellini"],
  chickpea: ["chickpea","chickpeas","garbanzo","garbanzo bean"],
  lentil: ["lentil","lentils","dal","red lentil","green lentil"],
  lemon: ["lemon","lemon juice","lemon zest"],
  lime: ["lime","lime juice","lime zest"],
  avocado: ["avocado","avocados"],
  pasta_sauce_tomato: ["marinara","tomato sauce","pasta sauce"],
  flour: ["flour","all purpose flour","plain flour","bread flour","whole wheat flour"],
  sugar: ["sugar","brown sugar","white sugar","powdered sugar","caster sugar"],
  wine: ["wine","white wine","red wine","cooking wine"]
};


// Reverse lookup: token -> family key
const TOKEN_TO_FAMILY = {};
for (const [fam, tokens] of Object.entries(INGREDIENT_FAMILIES)) {
  for (const t of tokens) TOKEN_TO_FAMILY[normalizeIngredient(t)] = fam;
}

const PANTRY_SET = new Set([
  "salt","pepper","black pepper","kosher salt","sea salt","oil","olive oil","vegetable oil","canola oil","sesame oil","coconut oil",
  "water","spice","spices","herb","herbs","sugar","brown sugar","flour","all purpose flour","baking powder","baking soda",
  "vinegar","white vinegar","apple cider vinegar","balsamic vinegar","soy sauce","hot sauce","crushed red pepper","red pepper flakes","paprika",
  "cumin","oregano","thyme","basil","parsley","bay leaf","rosemary","sage","stock","broth","chicken stock",
  "vegetable stock","beef stock","garlic powder","onion powder","chili flakes","sesame seeds","cornstarch",
  "corn starch","vanilla","vanilla extract","honey","maple syrup","mustard","dijon","ketchup","mayonnaise","mayo",
  "black pepper","white pepper","cayenne","chili powder","curry powder","garam masala","cinnamon","nutmeg",
  "cooking spray","nonstick spray","ice","ice cubes"
].map(normalizeIngredient));

function familyOf(token) {
  const t = normalizeIngredient(token);
  if (TOKEN_TO_FAMILY[t]) return TOKEN_TO_FAMILY[t];
  // soft includes
  for (const [fam, tokens] of Object.entries(INGREDIENT_FAMILIES)) {
    if (tokens.some(x => t.includes(normalizeIngredient(x)) || normalizeIngredient(x).includes(t))) return fam;
  }
  return t;
}

function tokensMatch(userToken, recipeToken) {
  const a = normalizeIngredient(userToken);
  const b = normalizeIngredient(recipeToken);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const fa = familyOf(a);
  const fb = familyOf(b);
  // Same known family (e.g. cheese ↔ parmesan, milk ↔ cream is separate families)
  if (fa && fb && fa === fb) return true;
  return false;
}

function recipeHasRequested(req, meal) {
  const keys = meal.keys || [];
  const text = normalizeText((meal.ingredients || []).join(" ") + " " + (meal.name || ""));
  for (const k of keys) if (tokensMatch(req, k)) return true;
  // family members in free text
  const fam = familyOf(req);
  const members = INGREDIENT_FAMILIES[fam] || [req];
  for (const m of members) {
    const re = new RegExp("\b" + escapeRegex(normalizeIngredient(m)) + "(?:s|es)?\b", "i");
    if (re.test(text)) return true;
  }
  return false;
}

function classifyRecipeIngredient(token) {
  const raw = String(token || "");
  const t = normalizeIngredient(raw.split(",")[0]);
  if (!t) return "pantry";

  // Explicit pantry list + families
  if (PANTRY_SET.has(t)) return "pantry";
  const fam = familyOf(t);
  const pantryFams = new Set(["oil","salt","pepper","spice","herb","stock","vinegar","wine","sugar","flour"]);
  if (pantryFams.has(fam)) return "pantry";
  if (/\b(salt|pepper|oil|vinegar|stock|broth|water|spice|seasoning|paprika|cumin|oregano|thyme|basil|parsley|garlic powder|onion powder|baking powder|baking soda|cornstarch|vanilla|soy sauce|hot sauce|ketchup|mustard|mayonnaise|mayo)\b/i.test(t)) {
    return "pantry";
  }

  // CORE: proteins, main starches, primary legumes — the “main event” of a plate
  const coreFams = new Set([
    "chicken","beef","pork","turkey","tuna","salmon","fish","egg","lamb","shrimp",
    "pasta","noodle","rice","potato","bread","quinoa","oats",
    "lentil","bean","chickpea","tofu"
  ]);
  if (coreFams.has(fam)) return "core";
  if (/\b(chicken|beef|pork|turkey|lamb|veal|steak|bacon|sausage|ham|salmon|tuna|shrimp|prawn|cod|tilapia|fish|egg|tofu|tempeh|seitan)\b/i.test(t)) return "core";
  if (/\b(pasta|spaghetti|penne|linguine|macaroni|noodle|ramen|rice|risotto|potato|bread|tortilla|quinoa|couscous|polenta|oat|oatmeal)\b/i.test(t)) return "core";
  if (/\b(lentil|chickpea|garbanzo|black bean|kidney bean|pinto bean|cannellini|bean|dal)\b/i.test(t)) return "core";

  // SUPPORTING: vegetables, fruit, dairy (except when dairy is the star — still supporting unless cheese-only dish), sauces that are substantial
  if (["cheese","milk","cream","butter","yogurt","tomato","onion","garlic","spinach","broccoli","carrot","pepper","mushroom","avocado","lemon","lime","apple","banana","berry","zucchini","cucumber","cabbage","corn","pea","sweet_potato"].includes(fam)) {
    return "supporting";
  }
  if (/\b(onion|garlic|shallot|leek|tomato|spinach|kale|lettuce|broccoli|carrot|celery|pepper|mushroom|zucchini|cucumber|cabbage|corn|pea|avocado|lemon|lime|apple|banana|berry|cheese|milk|cream|butter|yogurt|sauce|marinara)\b/i.test(t)) {
    return "supporting";
  }

  // Default: supporting produce / misc — not pantry unless short pure seasoning
  if (t.length <= 3) return "pantry";
  return "supporting";
}


const capitalize = v => v ? v.charAt(0).toUpperCase()+v.slice(1) : "";
const escapeHtml = v => String(v??"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const escapeRegex = v => String(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const toNumber = v => { if (v==null||v==="") return null; const n=Number(v); return Number.isFinite(n)?n:null; };

function getServings() {
  const el = $("servings");
  const n = el ? Number(el.value) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/* ---------- Navigation ---------- */
function showView(name, { skipUrl = false } = {}) {
  // Grocery lives inside Meal Plan now
  if (name === "shop") name = "planner";
  const current = document.querySelector(".view.active");
  const currentName = current ? (current.id || "").replace(/^view-/, "") : "";
  if (currentName && currentName !== name) {
    if (currentName !== "recipe") lastNonRecipeView = currentName;
    if (viewHistory[viewHistory.length - 1] !== name) {
      viewHistory.push(name);
      if (viewHistory.length > 30) viewHistory.shift();
    }
  }
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(l => l.classList.toggle("active", l.dataset.nav === name));
  const el = $("view-" + name);
  if (el) el.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name !== "recipe") clearRecipeSchema();
  if (!skipUrl && name !== "recipe" && VIEW_META[name]) {
    const meta = VIEW_META[name];
    navigateTo(meta.path, { replace: false });
    setPageMeta(meta);
  }
  // Recipes page: auto-load random catalog when nothing searched yet
  if (name === "search" && !nameResults.length && !($("nameSearchInput")?.value || "").trim()) {
    loadRandomNameRecipes();
  }
  if (name === "favorites") renderFavoritesPage();
}
function goBackView() {
  if (viewHistory.length > 1) viewHistory.pop();
  let prev = viewHistory[viewHistory.length - 1] || lastNonRecipeView || "home";
  if (prev === "recipe") prev = lastNonRecipeView || "home";
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(l => l.classList.toggle("active", l.dataset.nav === prev));
  const el = $("view-" + prev);
  if (el) el.classList.add("active");
  else {
    const home = $("view-home");
    if (home) home.classList.add("active");
    prev = "home";
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (VIEW_META[prev]) {
    navigateTo(VIEW_META[prev].path, { replace: true });
    setPageMeta(VIEW_META[prev]);
  }
}
document.querySelectorAll("[data-nav]").forEach(el => {
  el.addEventListener("click", e => {
    e.preventDefault();
    showView(el.dataset.nav);
  });
});

/* ---------- Parsing ---------- */

function parseIngredients(value) {
  if (!value) return [];

  let parts = [];

  if (Array.isArray(value)) {
    parts = value.flat().map(x => String(x).trim()).filter(Boolean);
  } else if (typeof value === "string") {
    let text = value.trim();
    if (!text) return [];

    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const p = JSON.parse(text);
        if (Array.isArray(p)) {
          parts = p.flat().map(x => String(x).trim()).filter(Boolean);
        }
      } catch {}
    }

    if (!parts.length) {
      // Prefer pipe / semicolon / newlines; avoid naive comma split
      if (/[|;]/.test(text)) {
        parts = text.split(/[|;]+/);
      } else if (/\r?\n/.test(text)) {
        parts = text.split(/\r?\n/);
      } else {
        parts = smartCommaSplit(text);
      }
    }
  } else {
    return [];
  }

  parts = parts
    .map(x => x.replace(/^\[|\]$/g, "").replace(/^["']|["']$/g, "").trim())
    .map(x => x.replace(/^,\s*/, "").replace(/,\s*$/, "").trim())
    .filter(Boolean);

  // Rejoin prep-only fragments onto the previous real ingredient
  const merged = [];
  for (const part of parts) {
    if (!merged.length) {
      merged.push(part);
      continue;
    }
    if (isPrepOnlyFragment(part) || isContinuationFragment(part)) {
      merged[merged.length - 1] = merged[merged.length - 1] + ", " + part;
    } else {
      merged.push(part);
    }
  }

  return merged.filter(x => x.length > 1 && !isPrepOnlyFragment(x));
}

function isPrepOnlyFragment(s) {
  const t = String(s).trim().toLowerCase();
  if (!t) return true;
  if (/^(cored|seeded|and chopped|chopped|sliced|diced|minced|peeled|trimmed|washed|dried|dried well|washed and dried well|optional|to taste|for serving|divided|plus more|softened|melted|room temperature|ground or cut into bite-size pieces|cut into bite-size pieces|white and green parts|boston|or romaine\)?|bibb)$/i.test(t)) return true;
  if (/^(and|&)\s/i.test(t) && t.length < 28) return true;
  if (t.length < 3) return true;
  // fragments that are only cooking instructions
  if (/^(washed|dried|drained|rinsed|thawed|defrosted)(\s+and\s+\w+)?$/i.test(t)) return true;
  return false;
}

function isContinuationFragment(s) {
  const t = String(s).trim();
  // does NOT start like a new ingredient (no leading quantity)
  const looksNew = /^(?:\d|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|a\s|an\s|one\s|two\s|three\s|four\s|half\s|quarter\s|large\s|medium\s|small\s|pinch\s|handful\s)/i.test(t);
  if (looksNew) return false;
  // short-ish trailing descriptors
  if (t.length < 48 && /^(cored|seeded|chopped|sliced|diced|minced|peeled|trimmed|washed|dried|optional|divided|plus more|to taste|for garnish|for serving|thinly sliced|finely chopped|roughly chopped|bite-size|into pieces|into strips)/i.test(t)) return true;
  if (/^(and\s)/i.test(t) && t.length < 40) return true;
  return false;
}

function smartCommaSplit(text) {
  const chunks = [];
  const rough = text.split(",");
  let buf = "";
  for (let i = 0; i < rough.length; i++) {
    const piece = rough[i].trim();
    if (!piece) continue;
    const looksNew = /^(?:\d|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|a\s|an\s|one\s|two\s|three\s|four\s|half\s|quarter\s|large\s|medium\s|small\s|pinch\s|handful\s)/i.test(piece);
    if (!buf) {
      buf = piece;
    } else if (looksNew) {
      chunks.push(buf);
      buf = piece;
    } else {
      buf += ", " + piece;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [text];
}

function normalizeSteps(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(x => String(x).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  const text = value.trim();
  if (!text) return [];
  const lines = text.split(/\r\n|\n|\r/).map(l => l.replace(/^\s*\d+[\).\-\:]\s*/,"").trim()).filter(l => l.length > 5);
  if (lines.length > 1) return lines;
  return text.split(/\.\s+/).map(s => s.trim()).filter(s => s.length > 5).map(s => s.endsWith(".")?s:s+".");
}

function parseFraction(str) {
  str = String(str).trim();
  const mixed = str.match(/^(\d+)\s*[-\s]?(\d+)\/(\d+)$/);
  if (mixed) return parseFloat(mixed[1]) + parseFloat(mixed[2])/parseFloat(mixed[3]);
  const unicode = {"¼":0.25,"½":0.5,"¾":0.75,"⅓":1/3,"⅔":2/3,"⅛":0.125,"⅜":0.375,"⅝":0.625,"⅞":0.875};
  for (const [u,v] of Object.entries(unicode)) if (str.includes(u)) return (parseFloat(str)||0)+v;
  const frac = str.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseFloat(frac[1])/parseFloat(frac[2]);
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

function parseQuantityAndUnit(ingredientStr) {
  let s = ingredientStr.toLowerCase().replace(/\s+/g, " ").trim();
  let qty = null, unit = null, rest = s;

  // Prefer weight/volume in parentheses e.g. (8–10 lb. total) or (about 2 cups)
  const paren = s.match(/\(([^)]*(?:lb|lbs|pound|oz|ounce|kg|g|gram|cup|tbsp|tsp|ml)[^)]*)\)/i);
  if (paren) {
    const inner = paren[1];
    const range = inner.match(/(\d+(?:\.\d+)?)\s*[–—−-]\s*(\d+(?:\.\d+)?)/);
    if (range) {
      qty = (parseFloat(range[1]) + parseFloat(range[2])) / 2;
    } else {
      const one = inner.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])/);
      if (one) qty = parseFraction(one[1].replace(/\s+/g, " "));
    }
    const unitPatternsP = [
      {re:/\b(cups?|c\.)\b/,unit:"cup"},{re:/\b(tablespoons?|tbsp\.?)\b/,unit:"tbsp"},{re:/\b(teaspoons?|tsp\.?)\b/,unit:"tsp"},
      {re:/\b(pounds?|lbs?\.?)\b/,unit:"lb"},{re:/\b(ounces?|oz\.?)\b/,unit:"oz"},{re:/\b(kilograms?|kg)\b/,unit:"kg"},
      {re:/\b(grams?|g)\b/,unit:"g"},{re:/\b(ml|milliliters?)\b/,unit:"ml"}
    ];
    for (const {re, unit:u} of unitPatternsP) if (re.test(inner)) { unit = u; break; }
  }

  if (qty == null) {
    const clean = s.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
    // range at start: 2-3 cups
    const rangeLead = clean.match(/^(\d+(?:\.\d+)?)\s*[–—−-]\s*(\d+(?:\.\d+)?)\s*(.*)$/);
    if (rangeLead) {
      qty = (parseFloat(rangeLead[1]) + parseFloat(rangeLead[2])) / 2;
      rest = rangeLead[3];
    } else {
      const qtyMatch = clean.match(/^([0-9¼½¾⅓⅔⅛⅜⅝⅞\s\/\.\-]+)\s*(.*)$/);
      if (qtyMatch) {
        qty = parseFraction(qtyMatch[1].replace(/\s+/g, " ").trim());
        rest = qtyMatch[2];
      }
    }
  }

  if (!unit) {
    const unitPatterns = [
      {re:/\b(cups?|c\.)\b/,unit:"cup"},{re:/\b(tablespoons?|tbsp\.?)\b/,unit:"tbsp"},{re:/\b(teaspoons?|tsp\.?)\b/,unit:"tsp"},
      {re:/\b(pounds?|lbs?\.?)\b/,unit:"lb"},{re:/\b(ounces?|oz\.?)\b/,unit:"oz"},{re:/\b(kilograms?|kg)\b/,unit:"kg"},
      {re:/\b(grams?|g)\b/,unit:"g"},{re:/\b(ml|milliliters?)\b/,unit:"ml"},
      {re:/\b(slices?)\b/,unit:"slice"},{re:/\b(cloves?)\b/,unit:"clove"},{re:/\b(large)\b/,unit:"large"},
      {re:/\b(medium)\b/,unit:"medium"},{re:/\b(cans?)\b/,unit:"can"},{re:/\b(whole)\b/,unit:"whole"},
      {re:/\b(racks?)\b/,unit:"rack"},{re:/\b(pieces?|pcs?)\b/,unit:"piece"}
    ];
    for (const {re, unit:u} of unitPatterns) if (re.test(rest) || re.test(s)) { unit = u; break; }
  }
  if (qty == null || qty === 0) qty = 1;
  return { qty, unit, text: rest };
}

function mapIngredientToUsda(str) {
  const s = String(str || "").toLowerCase();
  if (!s.trim()) return null;
  for (const [re, key] of INGREDIENT_MAP) if (re.test(s)) return key;
  // soft token fallback against USDA keys / family words
  const tokens = s.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
  for (const t of tokens) {
    if (USDA[t]) return t;
    if (USDA[t + "s"]) return t + "s";
  }
  return null;
}

function gramsFromQty(qty, unit, entry) {
  if (!entry) return null;
  const units = entry.unitG || {};
  if (unit === "g") return qty;
  if (unit === "kg") return qty * 1000;
  if (unit === "ml") return qty; // approx 1g/ml for water-like
  if (unit === "lb") return qty * 453.6;
  if (unit === "oz") return qty * 28.35;
  if (unit && units[unit]) return qty * units[unit];
  if (unit === "rack") return qty * (units.whole || 1800); // spareribs ~4 lb/rack rough
  if (unit === "piece") return qty * (units.piece || units.medium || 100);
  // No unit: prefer medium size, else conservative 50g only for produce-like
  if (units.medium) return qty * units.medium;
  if (units.piece) return qty * units.piece;
  if (units.large) return qty * units.large;
  if (units.oz) return qty * units.oz;
  return qty * 50;
}

function calculateNutritionFromIngredients(list) {
  let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, matched = 0, weightG = 0;
  const unmatched = [];
  for (const raw of list) {
    if (!raw || String(raw).trim().length < 2) continue;
    const lower = String(raw).toLowerCase().trim();
    // Only skip pure water or pure salt/pepper with no measurable fat/carb ingredient
    if (/^(water|ice)\b/.test(lower) && !/coconut|tonic|soda/.test(lower)) continue;
    if (/^(kosher salt|sea salt|salt|black pepper|pepper)\b/.test(lower) && /to taste|for serving|pinch/.test(lower)) continue;
    if (/^pinches? of (salt|pepper)/.test(lower)) continue;

    const key = mapIngredientToUsda(raw);
    if (!key || !USDA[key]) {
      unmatched.push(lower.slice(0, 40));
      continue;
    }
    const entry = USDA[key];
    const { qty, unit } = parseQuantityAndUnit(raw);
    let grams = gramsFromQty(qty, unit, entry);
    if (!grams || grams <= 0) continue;
    // Oils/spices: if no unit and qty is small number of "to taste" style, keep small
    if ((key === "oil" || key === "olive_oil" || key === "spice" || key === "herb") && !unit && qty === 1) {
      grams = Math.min(grams, key === "herb" || key === "spice" ? 3 : 14); // ~1 tbsp oil default
    }
    if (grams > 8000) grams = 8000;
    const f = grams / 100;
    totalCal += entry.cal * f;
    totalProtein += entry.protein * f;
    totalCarbs += entry.carbs * f;
    totalFat += entry.fat * f;
    matched++;
    weightG += grams;
  }
  if (matched < 1) return null;
  if (totalCal > 15000) {
    const damp = 15000 / totalCal;
    totalCal *= damp; totalProtein *= damp; totalCarbs *= damp; totalFat *= damp;
  }
  return {
    cal: totalCal,
    protein: totalProtein,
    carbs: totalCarbs,
    fat: totalFat,
    matchedIngredients: matched,
    weightG,
    unmatchedCount: unmatched.length
  };
}

function scaleIngredientLine(line, factor) {
  if (!line || !Number.isFinite(factor) || Math.abs(factor - 1) < 0.001) return line;
  const toFrac = n => {
    if (!Number.isFinite(n) || n <= 0) return "0";
    if (n >= 20) return String(Math.round(n * 10) / 10);
    if (n >= 5) return String(Math.round(n * 4) / 4);
    const whole = Math.floor(n + 1e-9);
    const frac = n - whole;
    const fractions = [[0.125,"⅛"],[0.25,"¼"],[0.333,"⅓"],[0.375,"⅜"],[0.5,"½"],[0.625,"⅝"],[0.667,"⅔"],[0.75,"¾"],[0.875,"⅞"]];
    for (const [v, s] of fractions) if (Math.abs(frac - v) < 0.04) return whole ? (whole + s) : s;
    const r = Math.round(n * 100) / 100;
    return String(r);
  };
  const scaleNumStr = (numStr) => {
    const q = parseFraction(String(numStr).replace(/\s+/g, " ").trim());
    if (q == null || !(q > 0)) return numStr;
    return toFrac(q * factor);
  };
  let text = String(line).trim();
  // Scale ranges first: 8-10, 8–10, 8 to 10 (inside or outside parens)
  text = text.replace(/(\d+(?:\/\d+)?(?:\.\d+)?)\s*([–—−-]|to)\s*(\d+(?:\/\d+)?(?:\.\d+)?)/gi, (_, a, sep, b) => {
    return scaleNumStr(a) + (sep === "to" ? " to " : "–") + scaleNumStr(b);
  });
  // Scale leading quantity (once)
  const m = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)(\s+)(.*)$/i);
  if (m) {
    const qty = parseFraction(m[1].replace(/\s+/g, " ").trim());
    if (qty && qty > 0) {
      const scaled = qty * factor;
      if (scaled < 0.08 && !/lb|kg|pound|rack|pound/i.test(m[3])) {
        // don't turn weight-heavy items into pinch
        text = toFrac(scaled) + m[2] + m[3];
      } else if (scaled < 0.08) {
        text = "pinch of " + m[3];
      } else {
        text = toFrac(scaled) + m[2] + m[3];
      }
    }
  }
  // Scale remaining standalone counts before units that weren't in a range
  // e.g. "(2 cups)" after other edits — careful not to double-scale
  // Only scale numbers inside parentheses that look like quantities if factor already applied to leading
  // Re-scan parentheticals that still have unscaled-looking patterns with units
  text = text.replace(/\(([^)]*)\)/g, (full, inner) => {
    let inn = inner;
    // ranges already handled globally; scale lone qty+unit patterns
    inn = inn.replace(/\b(\d+(?:\/\d+)?(?:\.\d+)?)\s*(lb\.?|lbs\.?|pounds?|oz\.?|ounces?|kg|g|grams?|cups?|tbsp|tsp|ml|L)\b/gi, (mm, num, unit) => {
      // Avoid double-scaling: if number already looks fractional from factor, still ok once
      return scaleNumStr(num) + " " + unit;
    });
    return "(" + inn + ")";
  });
  return text;
}

function scaleIngredientsList(list, factor) {
  if (!Array.isArray(list)) return [];
  if (Math.abs(factor-1) < 0.001) return list.slice();
  return list.map(l => scaleIngredientLine(l, factor));
}

function guessMealType(title, category="", ingredients=[]) {
  const t = normalizeText(`${title} ${category} ${ingredients.join(" ")}`);
  if (/breakfast|pancake|waffle|omelette|oatmeal|muffin|bagel/.test(t)) return "breakfast";
  if (/snack|appetizer|dip|cocktail|chip/.test(t)) return "snack";
  if (/dessert|cake|cookie|brownie|pie/.test(t)) return "snack";
  if (/dinner|roast|steak|casserole|stew|burger|pizza/.test(t)) return "dinner";
  if (/lunch|salad|sandwich|wrap|soup|bowl/.test(t)) return "lunch";
  if (/chicken|beef|pork|salmon|steak/.test(t)) return "dinner";
  return "lunch";
}

function guessTime(title, method="", steps=[], ingredients=[]) {
  const blob = normalizeText([title, method, ...(steps || []).slice(0, 12)].join(" "));
  // Explicit minutes in instructions (take max plausible cook mention)
  let explicit = null;
  const minMatches = [...blob.matchAll(/(\d{1,3})\s*(?:-|–|to\s+)?(\d{0,3})?\s*min(?:ute)?s?/g)];
  for (const m of minMatches) {
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    const val = Math.max(a, b || a);
    if (val >= 5 && val <= 240) explicit = Math.max(explicit || 0, val);
  }
  const hourMatches = [...blob.matchAll(/(\d+(?:\.\d+)?)\s*(?:-|–|to\s+)?(\d*)\s*hours?/g)];
  for (const m of hourMatches) {
    const a = parseFloat(m[1]);
    const b = m[2] ? parseFloat(m[2]) : a;
    const mins = Math.round(Math.max(a, b || a) * 60);
    if (mins >= 30 && mins <= 480) explicit = Math.max(explicit || 0, mins);
  }

  // Method-based base
  const m = normalizeText(method || "");
  let base = 30;
  if (/no.?cook|raw|assemble|mix only/.test(blob)) base = 10;
  else if (/microwave/.test(m + blob)) base = 12;
  else if (/air.?fry/.test(m + blob)) base = 22;
  else if (/grill|bbq|broil/.test(m + blob)) base = 25;
  else if (/stir.?fry|saute|sauté|skillet|pan.?fry|fry/.test(m + blob)) base = 25;
  else if (/boil|simmer|poach|steam/.test(m + blob)) base = 30;
  else if (/pressure|instant.?pot/.test(m + blob)) base = 35;
  else if (/bake|baked|oven|roast|roasted/.test(m + blob)) base = 50;
  else if (/braise|stew|slow.?cook|casserole|smoke/.test(m + blob)) base = 90;
  else if (/grill/.test(m)) base = 30;

  // Title keywords
  if (/quick|fast|easy 15|15.min|10.min|weeknight/.test(blob)) base = Math.min(base, 20);
  if (/slow.?roasted|overnight|all.?day/.test(blob)) base = Math.max(base, 120);

  // Steps complexity
  const nSteps = (steps || []).length;
  if (nSteps >= 10) base += 15;
  else if (nSteps >= 6) base += 8;
  else if (nSteps <= 2) base = Math.min(base, 25);

  // Heavy proteins / large roasts
  const ing = normalizeText((ingredients || []).slice(0, 8).join(" "));
  if (/whole chicken|turkey|brisket|pork shoulder|leg of lamb|sparerib|spare rib/.test(ing + blob)) {
    base = Math.max(base, 75);
  }
  if (/cookie|muffin|pancake|omelette|scrambled|toast|sandwich|salad|smoothie/.test(blob)) {
    base = Math.min(base, 25);
  }

  let minutes = explicit != null ? Math.round(explicit * 0.55 + base * 0.45) : base;
  // Prefer explicit when it's the only strong signal for long cooks
  if (explicit != null && explicit >= 60) minutes = Math.round(explicit * 0.7 + base * 0.3);
  if (explicit != null && explicit <= 20 && base <= 35) minutes = explicit;

  minutes = Math.max(8, Math.min(240, Math.round(minutes / 5) * 5)); // round to 5 min
  return minutes;
}


/** Prefer a larger/sharper image URL when the source supports it */
function upgradeImageUrl(url) {
  if (!url || typeof url !== "string") return url;
  let u = url;
  // Unsplash
  if (u.includes("images.unsplash.com")) {
    u = u.replace(/([?&])w=\d+/g, "").replace(/([?&])q=\d+/g, "");
    u += (u.includes("?") ? "&" : "?") + "w=1600&q=85&auto=format&fit=crop";
    return u;
  }
  // Common thumbnail patterns → try larger
  u = u.replace(/([?&](?:w|width|h|height|size)=)\d+/gi, (m, p) => p + "1200");
  u = u.replace(/\/\d+x\d+\//, "/1200x800/");
  u = u.replace(/_thumb\./i, ".");
  u = u.replace(/\/thumb(nail)?s?\//i, "/");
  return u;
}

function getFallbackImage(recipe) {
  const text = normalizeText([recipe.name, recipe.category, ...(recipe.keys||[])].join(" "));
  const rules = [["potato","potato"],["pasta","pasta"],["rice","rice"],["chicken","chicken"],["beef","beef"],["tuna","tuna"],["fish","fish"],["egg","egg"],["bread","bread"],["salad","vegetable"]];
  for (const [k,f] of rules) if (text.includes(k)) return FALLBACK_IMAGES[f];
  return FALLBACK_IMAGES.food;
}

function handleImageError(img) {
  if (!img) return;
  const fb = img.dataset.fallback;
  if (!fb || img.src === fb) return;
  img.onerror = null;
  img.src = fb;
}
window.handleImageError = handleImageError;

function convertRecipe(r, index=0) {
  const title = r.dish_name || r.dish_name_normalized || "Untitled Recipe";
  const ingredients = parseIngredients(r.ingredients_clean);
  const keys = [...new Set(ingredients.map(normalizeIngredient).filter(Boolean))];
  const type = guessMealType(title, r.food_type, ingredients);
  const steps = normalizeSteps(r.instructions);
  // Recipe quantities stay as written; servings scale is for cooking view only.
  // Prefer DB nutrition when present; otherwise USDA estimate from ingredients.
  const guessedYield = (() => {
    const portion = String(r.portion_size_clean || r.servings || r.yield || "");
    const blob = normalizeText([title, portion, (ingredients || []).slice(0, 3).join(" ")].join(" "));
    let m = blob.match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:servings?|portions?|people)/);
    if (m) {
      const n = Math.round((parseInt(m[1], 10) + parseInt(m[2], 10)) / 2);
      if (n >= 1 && n <= 20) return n;
    }
    m = blob.match(/(\d+)\s*(?:servings?|portions?|people|serves)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 20) return n;
    }
    m = portion.match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 20) return n;
    }
    // Infer from protein weight
    const heavy = normalizeText(ingredients.slice(0, 5).join(" "));
    if (/whole chicken|turkey breast|brisket|3\s*lb|4\s*lb/.test(heavy)) return 6;
    return 4;
  })();
  const baseServings = guessedYield;
  const currentServings = getServings();
  const scaleFactor = 1;

  let cal = toNumber(r.calories_kcal);
  let proteinVal = toNumber(r.protein_g);
  let carbs = toNumber(r.carbohydrate_g);
  let fat = toNumber(r.fat_g);
  let estimated = false;
  let nutritionMeta = null;
  let fullCal = null, fullProtein = null, fullCarbs = null, fullFat = null;

  // Always run ingredient-based estimate (veggies + oils + pantry counted)
  const usda = calculateNutritionFromIngredients(ingredients);

  if (cal == null || proteinVal == null) {
    if (usda && usda.matchedIngredients >= 1) {
      fullCal = usda.cal; fullProtein = usda.protein; fullCarbs = usda.carbs; fullFat = usda.fat;
      cal = Math.round(fullCal / baseServings);
      proteinVal = Math.round(fullProtein / baseServings);
      carbs = Math.round(fullCarbs / baseServings);
      fat = Math.round(fullFat / baseServings);
      if (cal > 1200) { const d = 850 / cal; cal = Math.round(cal * d); proteinVal = Math.round(proteinVal * d); carbs = Math.round(carbs * d); fat = Math.round(fat * d); }
      if (cal < 50) cal = 50;
      estimated = true;
      nutritionMeta = { ...usda, baseServings, fullCal, fullProtein, fullCarbs, fullFat };
    } else {
      const blob = normalizeText(title + " " + ingredients.join(" "));
      if (/salad|broth|soup/.test(blob)) { cal = 220; proteinVal = 12; carbs = 18; fat = 10; }
      else if (/dessert|cake|cookie|brownie/.test(blob)) { cal = 380; proteinVal = 5; carbs = 48; fat = 18; }
      else if (/chicken|beef|pork|salmon|tuna|steak|turkey/.test(blob)) { cal = 480; proteinVal = 35; carbs = 28; fat = 18; }
      else if (/pasta|noodle|rice|risotto/.test(blob)) { cal = 520; proteinVal = 18; carbs = 62; fat = 16; }
      else { cal = 400; proteinVal = 20; carbs = 35; fat = 14; }
      estimated = true;
      fullCal = cal * baseServings; fullProtein = proteinVal * baseServings;
      fullCarbs = carbs * baseServings; fullFat = fat * baseServings;
    }
  } else {
    // DB has numbers — fill missing macros from ingredient estimate when possible
    fullCal = cal * baseServings; fullProtein = proteinVal * baseServings;
    fullCarbs = (carbs != null ? carbs : 0) * baseServings; fullFat = (fat != null ? fat : 0) * baseServings;
    if (usda && usda.matchedIngredients >= 2) {
      if (carbs == null) { carbs = Math.round(usda.carbs / baseServings); fullCarbs = usda.carbs; }
      if (fat == null) { fat = Math.round(usda.fat / baseServings); fullFat = usda.fat; }
      nutritionMeta = { ...usda, baseServings, fromDb: true };
    }
  }

  const scaledIngredients = scaleIngredientsList(ingredients, scaleFactor);
  const dietTags = detectDietTags({ name: title, ingredients, keys, protein: proteinVal, carbs });
  const fallbackImage = getFallbackImage({ name: title, category: r.food_type || "", keys });

  return {
    id: r.id ?? index + 1,
    name: title,
    category: r.food_type || "",
    cookingMethod: r.cooking_method || "",
    type,
    image: r.image_url ? upgradeImageUrl(r.image_url) : null,
    fallbackImage,
    cal, protein: proteinVal, carbs, fat,
    totalCal: Math.round((fullCal / baseServings) * currentServings),
    totalProtein: Math.round((fullProtein / baseServings) * currentServings),
    totalCarbs: Math.round((fullCarbs / baseServings) * currentServings),
    totalFat: Math.round((fullFat / baseServings) * currentServings),
    estimated, nutritionMeta,
    time: guessTime(title, r.cooking_method, steps, ingredients),
    tags: [],
    keys, ingredients, scaledIngredients,
    servings: currentServings, baseServings, scaleFactor,
    steps,
    dietTags: null, // filled below
    dataSource: r.data_source || "original"
  };
}

/* ---------- SMART MATCH ---------- */


function splitIngredientsByRole(ingredientLines) {
  const core = [], supporting = [], pantry = [];
  for (const line of (ingredientLines || [])) {
    let cleaned = String(line).split(",")[0];
    // strip leading qty + unit
    cleaned = cleaned.replace(/^\d+[\d\s\/¼½¾⅓⅔⅛⅜⅝⅞.\-–—]*\s*(cups?|c\.|tbsp|tsp|tablespoons?|teaspoons?|pounds?|lbs?\.?|ounces?|oz\.?|grams?|g|kg|ml|large|medium|small|racks?|pieces?|cloves?|cans?|slices?|whole)?\.?\s*/i, "");
    // strip trailing parenthetical weights
    cleaned = cleaned.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const token = normalizeIngredient(cleaned) || normalizeText(line).slice(0, 48);
    const cls = classifyRecipeIngredient(token + " " + cleaned);
    if (cls === "core") core.push(line);
    else if (cls === "pantry") pantry.push(line);
    else supporting.push(line);
  }
  return { core, supporting, pantry };
}

function ingredientMatch(meal) {
  const selected = selectedIngredients.map(normalizeIngredient).filter(Boolean);
  const recipeKeys = [...new Set((meal.keys || []).map(normalizeIngredient).filter(Boolean))];

  if (!selected.length) {
    return {
      matched: 0, total: 0, missing: 0, matchRate: 0, selectedCount: 0,
      isExactSet: false, canMakeNow: false, usesAllSelected: false,
      have: [], missingList: [], extra: [],
      coreHave: [], coreMissing: [], supportingMissing: [],
      requestedHave: [], requestedMissing: [],
      neededSupporting: [], neededCore: []
    };
  }

  const requestedHave = [];
  const requestedMissing = [];
  for (const s of selected) {
    if (recipeHasRequested(s, meal)) requestedHave.push(s);
    else requestedMissing.push(s);
  }

  // Classify recipe ingredients the user still needs
  const neededCore = [];
  const neededSupporting = [];
  for (const k of recipeKeys) {
    // skip if user already covers this via family
    if (selected.some(s => tokensMatch(s, k))) continue;
    if (PANTRY_SET.has(normalizeIngredient(k))) continue;
    const cls = classifyRecipeIngredient(k);
    if (cls === "pantry") continue;
    if (cls === "core") neededCore.push(k);
    else neededSupporting.push(k);
  }

  // Limit lists for UI
  const extra = [...neededCore, ...neededSupporting].slice(0, 8);
  const matched = requestedHave.length;
  const selectedCount = selected.length;
  const matchRate = selectedCount ? Math.round((matched / selectedCount) * 100) : 0;
  const usesAllSelected = requestedMissing.length === 0 && selectedCount > 0;
  // can make now = all requested present AND no missing core/supporting (pantry ok)
  const canMakeNow = usesAllSelected && neededCore.length === 0 && neededSupporting.length === 0;

  return {
    matched, total: selectedCount, missing: requestedMissing.length,
    matchRate, selectedCount,
    isExactSet: usesAllSelected,
    canMakeNow,
    usesAllSelected,
    have: requestedHave,
    missingList: requestedMissing,
    extra,
    requestedHave,
    requestedMissing,
    neededCore: neededCore.slice(0, 6),
    neededSupporting: neededSupporting.slice(0, 6)
  };
}

function getMatchMode() {
  const el = document.querySelector('input[name="matchMode"]:checked');
  return el ? el.value : matchMode;
}



function detectDietTags(meal) {
  const text = normalizeText([meal.name, ...(meal.ingredients||[]), ...(meal.keys||[])].join(" "));
  const tags = [];
  const has = (re) => re.test(text);

  // Animal products — comprehensive
  const MEAT_RE = /chicken|beef|pork|turkey|lamb|veal|duck|bacon|ham|sausage|chorizo|steak|meatball|meat\b|prosciutto|salami|pepperoni|pancetta|ribs|brisket|ground beef|mince|hot dog|frankfurter|anchovy|anchovies|fish\b|tuna|salmon|cod|shrimp|prawn|lobster|crab|seafood|clam|mussel|oyster|sardine/;
  const EGG_RE = /\begg\b|\beggs\b|egg yolk|egg white|omelette|omelet/;
  const DAIRY_RE = /milk|cheese|cream|butter|yogurt|yoghurt|parmesan|cheddar|mozzarella|ricotta|feta|gouda|brie|ghee|whey|casein|ice cream/;
  const HONEY_RE = /honey/;
  const GRAIN_RE = /pasta|spaghetti|penne|rice\b|bread|flour|wheat|oat|oatmeal|cereal|tortilla|noodle|couscous|quinoa|barley|rye|cornmeal|bagel|bun|toast|cracker|pita/;
  const LEGUME_RE = /bean|lentil|chickpea|peanut|soy|tofu|edamame|tempeh|hummus/;
  const SUGAR_RE = /sugar|maple syrup|agave|corn syrup|candy/;
  const HIGH_CARB_RE = /potato|pasta|rice\b|bread|sugar|flour|oat|banana|corn\b/;
  const VEG_RE = /vegetable|broccoli|spinach|tomato|onion|pepper|carrot|cabbage|lettuce|zucchini|cucumber|celery|kale|asparagus|mushroom|eggplant|aubergine/;

  const hasMeat = has(MEAT_RE);
  const hasEgg = has(EGG_RE);
  const hasDairy = has(DAIRY_RE);
  const hasHoney = has(HONEY_RE);
  const hasGrain = has(GRAIN_RE);
  const hasLegume = has(LEGUME_RE);
  const hasSugar = has(SUGAR_RE);

  // Vegetarian: NO meat/fish/seafood (eggs + dairy OK)
  if (!hasMeat) tags.push("vegetarian");
  // Vegan: no meat, egg, dairy, honey
  if (!hasMeat && !hasEgg && !hasDairy && !hasHoney) tags.push("vegan");
  // Carnivore: animal only — has meat/egg, almost no plants
  if ((hasMeat || hasEgg) && !has(VEG_RE) && !hasGrain && !hasLegume && !has(/tomato|onion|garlic|fruit/)) tags.push("carnivore");
  // Paleo: no grain, legume, dairy, refined sugar, soy
  if (!hasGrain && !hasLegume && !hasDairy && !hasSugar && !has(/soy/) && (hasMeat || has(VEG_RE) || hasEgg)) tags.push("paleo");
  // Keto: no high-carb staples
  if (!has(/pasta|rice\b|potato|bread|sugar|flour|oat|bean|lentil|banana/) && (hasMeat || hasDairy || hasEgg)) tags.push("keto");
  // Low carb
  if ((meal.carbs == null || meal.carbs <= 25) && !has(HIGH_CARB_RE)) tags.push("low-carb");
  // High protein
  if ((meal.protein || 0) >= 30) tags.push("high-protein");
  // Gluten-free rough
  if (!has(/pasta|bread|flour|wheat|barley|rye|couscous|noodle|soy sauce|seitan/)) tags.push("gluten-free");
  // Mediterranean
  if (has(/olive oil|tomato|fish|legume|vegetable|lemon/) && !has(/bacon|sausage|ham/)) tags.push("mediterranean");

  return tags;
}

function getSelectedDiet() {
  const el = $("dietFilter");
  return el ? el.value : "any";
}

function scoreMeal(meal) {
  const diet = getSelectedDiet();
  if (diet && diet !== "any") {
    const tags = meal.dietTags || detectDietTags(meal);
    if (!tags.includes(diet)) return -Infinity;
  }
  const maxTime = Number($("time")?.value) || 999;
  const targetCal = Number($("calories")?.value) || 0;
  const targetP = Number($("protein")?.value) || 0;
  const type = $("mealType")?.value || "any";
  const goal = $("goal")?.value || homeGoal || "any";
  const prefs = [...document.querySelectorAll(".pref:checked")].map(x => x.value);
  const match = ingredientMatch(meal);
  const mode = getMatchMode();

  if (meal.time > maxTime) return -Infinity;
  if (type !== "any" && meal.type !== type) return -Infinity;

  // Modes:
  // - similar: any overlap with selected ingredients (default)
  // - flexible: all selected present, allow up to 3 missing CORE from the recipe
  // - exact: all selected present and no missing CORE (cook with what I have)
  if (selectedIngredients.length > 0) {
    if (mode === "similar") {
      if (match.matched === 0) return -Infinity;
    } else if (mode === "flexible") {
      // Prefer recipes that use ALL selected; if few results, allow majority
      const need = selectedIngredients.length;
      if (match.matched === 0) return -Infinity;
      if (need >= 2 && match.matched < need && match.matched < Math.ceil(need * 0.5)) return -Infinity;
      if (need >= 2 && match.matched < need) {
        // soft: keep but lower score later; still allow if at least half
      } else if (match.missing > 0 && match.matched < need) {
        // partial ok for flexible when combined below
      }
      const missingCore = match.neededCore?.length || 0;
      if (match.matched >= need && missingCore > 3) return -Infinity;
    } else if (mode === "exact") {
      if (match.missing > 0) return -Infinity;
      if ((match.neededCore?.length || 0) > 0) return -Infinity;
    } else {
      if (match.matched === 0) return -Infinity;
    }
  }

  // Quick filters: hard filters (must match to appear)
  if (prefs.includes("quick") && (meal.time == null || meal.time > 20)) return -Infinity;
  if (prefs.includes("high-protein") && (meal.protein == null || meal.protein < 30)) return -Infinity;
  if (prefs.includes("low-calorie") && (meal.cal == null || meal.cal > 500)) return -Infinity;

  let score = 0;
  if (selectedIngredients.length > 0) {
    score += match.matchRate * 80;
    score += (match.matched || 0) * 120;
    if (match.usesAllSelected) score += 900;
    // canMakeNow still means zero core+supporting gaps; bonus if true
    if (match.canMakeNow) score += 1000;
    // Prefer few missing CORE items
    if ((match.neededCore?.length || 0) === 0 && match.usesAllSelected) score += 400;
    score -= match.missing * 120;
    score -= Math.min((match.neededCore?.length || 0) * 40, 160);
    score -= Math.min((match.neededSupporting?.length || 0) * 4, 20);
  }

  if (meal.steps?.length) score += 20;
  if (meal.image) score += 5;

  if (targetCal > 0 && meal.cal != null) {
    const d = Math.abs(meal.cal - targetCal) / Math.max(targetCal, 1);
    score += Math.max(-40, 40 - d * 70);
  }
  if (targetP > 0 && meal.protein != null) {
    const d = Math.abs(meal.protein - targetP) / Math.max(targetP, 1);
    score += Math.max(-40, 40 - d * 70);
  }

  if (goal === "build-muscle" || goal === "muscle") {
    score += (meal.protein >= 30 ? 40 : meal.protein >= 20 ? 20 : -10);
    score += ((meal.protein || 0) / Math.max(meal.cal || 1, 1)) * 400;
  }
  if (goal === "lose-fat" || goal === "fat-loss") {
    if (meal.cal <= 450) score += 35;
    else if (meal.cal <= 600) score += 15;
    score += (meal.protein >= 25 ? 25 : 0);
  }
  if (goal === "maintain") {
    if (meal.cal >= 350 && meal.cal <= 700) score += 20;
  }

  // Hunger from home wizard
  if (homeHunger === "small" && meal.cal > 450) score -= 25;
  if (homeHunger === "hungry" && meal.cal < 500) score -= 15;
  if (homeHunger === "hungry" && meal.cal >= 550) score += 15;

  if (prefs.includes("vegetarian")) {
    const meat = /chicken|beef|pork|turkey|fish|tuna|salmon|bacon|sausage|lamb|meat/.test(normalizeText(meal.name + " " + (meal.ingredients||[]).join(" ")));
    if (meat) return -Infinity;
    score += 25;
  }
  if (prefs.includes("high-protein") && (meal.protein || 0) >= 30) score += 30;
  if (prefs.includes("low-calorie") && (meal.cal || 9999) <= 500) score += 25;
  if (prefs.includes("quick") && (meal.time || 99) <= 20) score += 40;

  if (preferMyIngredients && selectedIngredients.length) {
    score += match.matchRate * 5;
  }

  return score;
}

/* ---------- Search ---------- */
async function searchRecipes(reset=true) {
  if (isLoading) return;
  if (reset && selectedIngredients.length) {
    trackEvent("recipe_search", { ingredients: selectedIngredients.join(","), mode: getMatchMode(), count: selectedIngredients.length });
  }
  isLoading = true;
  if (reset) {
    currentPage = 0; meals = []; rankedResults = []; hasMore = true;
    const grid = $("mealGrid");
    if (grid) grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><h3>Finding recipes…</h3></div>`;
  }
  try {
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    // Full-catalog strategy: when user has ingredients, pull larger random-ish slices
    // and rank client-side across the whole loaded set (true OR match on all selected).
    let query = supabaseClient.from(TABLE_NAME).select("*",{count:"exact"}).order("id",{ascending:true}).range(from,to);

    // Filter by selected ingredients so pasta+chicken etc. return real matches
    if (selectedIngredients.length > 0) {
      const mode = (typeof getMatchMode === "function" ? getMatchMode() : matchMode) || "similar";
      const primaries = [];
      for (const raw of selectedIngredients) {
        const token = normalizeIngredient(raw);
        if (!token || token.length < 2) continue;
        const fam = familyOf(token);
        // prefer short family key for broad match (pasta, chicken, cheese...)
        const primary = (fam && fam !== token && fam.length <= 12) ? fam : token;
        primaries.push(primary);
      }
      const uniquePrim = [...new Set(primaries)];

      if (uniquePrim.length >= 2 && mode !== "similar") {
        // Flexible / exact: require ALL selected (AND) so pairs like pasta+chicken work
        for (const t of uniquePrim.slice(0, 4)) {
          query = query.ilike("ingredients_clean", `%${t}%`);
        }
      } else if (uniquePrim.length >= 1) {
        // Similar (or single ingredient): OR across family synonyms
        const terms = [];
        for (const raw of selectedIngredients) {
          const token = normalizeIngredient(raw);
          if (!token) continue;
          const fam = familyOf(token);
          const alts = (INGREDIENT_FAMILIES[fam] || [token]).slice(0, 5);
          for (const a of alts) {
            const t = normalizeIngredient(a);
            if (t && t.length >= 2) terms.push(t);
          }
          terms.push(token);
        }
        const unique = [...new Set(terms)].slice(0, 20);
        if (unique.length) {
          const orParts = [];
          for (const t of unique) {
            orParts.push(`ingredients_clean.ilike.%${t}%`);
            orParts.push(`dish_name.ilike.%${t}%`);
          }
          query = query.or(orParts.join(","));
        }
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const newMeals = (data || []).map(convertRecipe);
    meals = reset ? newMeals : [...meals, ...newMeals];
    hasMore = newMeals.length === PAGE_SIZE;
    if (count != null && meals.length >= count) hasMore = false;
    dataReady = true;
    currentPage++;
    rankAndRender();
  } catch (err) {
    console.error(err);
    dataReady = true;
    if ($("mealGrid") && reset) $("mealGrid").innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Could not load</h3><p>${escapeHtml(err.message)}</p></div>`;
  } finally { isLoading = false; }
}

function rankAndRender(random=false) {
  if (!dataReady) return;
  rankedResults = meals.map(m => ({ ...m, score: scoreMeal(m), match: ingredientMatch(m) }))
    .filter(m => Number.isFinite(m.score));
  if (random) rankedResults.sort(() => Math.random() - 0.5);
  else rankedResults.sort((a,b) => b.score - a.score);
  renderMeals();
  renderSearchInfo();
  if ($("loadMoreBtn")) {
    $("loadMoreBtn").hidden = !hasMore;
    $("loadMoreBtn").textContent = hasMore ? "Load more meals" : "No more meals";
  }
}

function renderSearchInfo() {
  const count = rankedResults.length;
  if ($("resultsTitle")) $("resultsTitle").textContent = count ? `${count.toLocaleString()} meals` : "No meals match";
  if ($("matchInfo")) {
    if (!selectedIngredients.length) $("matchInfo").textContent = "Add ingredients and search. Use load more meals for another batch.";
    else {
      const mode = getMatchMode();
      if (mode === "exact") {
        $("matchInfo").textContent = `Only recipes you can make with: ${selectedIngredients.map(capitalize).join(", ")}`;
      } else if (mode === "flexible") {
        $("matchInfo").textContent = `Recipes using your ingredients (a few extras allowed): ${selectedIngredients.map(capitalize).join(", ")}`;
      } else {
        $("matchInfo").textContent = `Similar recipes matching any of: ${selectedIngredients.map(capitalize).join(", ")}`;
      }
    }
  }
  if ($("activeSearch")) {
    $("activeSearch").innerHTML = selectedIngredients.map(i =>
      `<span class="legend-pill">✓ ${escapeHtml(capitalize(i))}</span>`
    ).join("");
  }
}

function medal(i) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return `${i+1}.`;
}

function renderMeals(targetId="mealGrid", list=null) {
  const grid = $(targetId);
  if (!grid) return;
  const data = list || rankedResults;
  if (!data.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔎</div><h3>Nothing matches</h3><p>Try fewer filters or allow missing ingredients.</p></div>`;
    return;
  }
  grid.innerHTML = data.map((meal, idx) => {
    const match = meal.match || ingredientMatch(meal);
    let matchBlock = "";
    if (selectedIngredients.length) {
      const cls = match.isExactSet ? "exact" : match.matchRate >= 50 ? "partial" : "";
      matchBlock = `
        <div class="match-badge ${cls}">
          ${selectedIngredients.length <= 6 && idx < 3 ? medal(idx)+" " : ""}${
            match.canMakeNow ? "🟢 Cook with what you have"
            : match.usesAllSelected ? `🟢 ${match.matched}/${match.selectedCount} requested ingredients`
            : `🟡 ${match.matched}/${match.selectedCount} requested ingredients`
          }
        </div>
        ${match.requestedHave?.length ? `<div class="have-line">✓ ${match.requestedHave.map(capitalize).join(" · ")}</div>` : ""}
        ${match.requestedMissing?.length ? `<div class="missing-line">✗ Missing from recipe: ${match.requestedMissing.map(capitalize).join(", ")}</div>` : ""}
        ${match.neededCore?.length || match.neededSupporting?.length ? `<div class="missing-line" data-need-full="${escapeHtml((match.neededCore||[]).concat(match.neededSupporting||[]).join("||"))}">You'll need: ${(match.neededCore||[]).concat(match.neededSupporting||[]).slice(0,4).map(x=>escapeHtml(capitalize(x))).join(" · ")}${(match.neededCore||[]).concat(match.neededSupporting||[]).length>4?` <button type="button" class="mini-btn need-more-btn" onclick="event.stopPropagation();this.parentElement.innerHTML='You\'ll need: '+this.parentElement.dataset.needFull.split('||').map(s=>s.replace(/^./,c=>c.toUpperCase())).join(' · ')">+${(match.neededCore||[]).concat(match.neededSupporting||[]).length-4} more</button>`:""}</div>` : ""}
      `;
    }
    const est = meal.estimated ? " <small style='opacity:.6'>(est.)</small>" : "";
    const img = meal.image || meal.fallbackImage;
    const id = String(meal.id);
    const isSaved = saved.includes(id);
    return `
      <article class="meal">
        <div class="meal-image">
          <small>${escapeHtml(capitalize(meal.type))}</small>
          <img src="${escapeHtml(img)}" data-fallback="${escapeHtml(meal.fallbackImage)}" alt="" loading="lazy" onerror="handleImageError(this)">
          <button class="heart ${isSaved?"saved":""}" type="button" title="Save" onclick="event.stopPropagation();toggleSave('${escapeHtml(id)}')" style="width:44px;height:44px;font-size:1.35rem;box-shadow:0 2px 10px rgba(0,0,0,.12);">${isSaved?"♥":"♡"}</button>
        </div>
        <div class="meal-body">
          <h3>${escapeHtml(meal.name)}</h3>
          <div class="macros">
            <span class="macro">${meal.cal!=null?Math.round(meal.cal)+" kcal":"—"}</span>
            <span class="macro protein">${meal.protein!=null?"💪 "+Math.round(meal.protein)+"g":"—"}</span>
            <span class="macro">${meal.carbs!=null?Math.round(meal.carbs)+"g carbs":"—"}</span>
            <span class="macro">${meal.fat!=null?Math.round(meal.fat)+"g fat":"—"}</span>
          </div>
          <div style="font-size:11px;color:#888;">per serving · cook ${meal.servings||3}${est}</div>
          ${matchBlock}
          <div class="meal-bottom">
            <span class="meal-time">◷ ${meal.time} min</span>
            <button class="view-btn" type="button" onclick="showRecipe('${escapeHtml(id)}')">View recipe →</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

/* ---------- Ingredients UI ---------- */
function addIngredient(value, syncHome=true) {
  const n = normalizeIngredient(value);
  if (!n || selectedIngredients.includes(n)) return;
  selectedIngredients.push(n);
  renderChips();
  if (syncHome) renderHomeChips();
  syncSuggestChips();
  searchRecipes(true);
}
function removeIngredient(index) {
  selectedIngredients.splice(index, 1);
  renderChips();
  renderHomeChips();
  syncSuggestChips();
  searchRecipes(true);
}
window.removeIngredient = removeIngredient;

function toggleIngredient(value) {
  const n = normalizeIngredient(value);
  if (!n) return;
  const idx = selectedIngredients.indexOf(n);
  if (idx >= 0) {
    selectedIngredients.splice(idx, 1);
  } else {
    selectedIngredients.push(n);
  }
  renderChips();
  renderHomeChips();
  syncSuggestChips();
  searchRecipes(true);
}
window.toggleIngredient = toggleIngredient;

function syncSuggestChips() {
  document.querySelectorAll(".suggest-chip[data-add]").forEach(btn => {
    const n = normalizeIngredient(btn.dataset.add);
    btn.classList.toggle("selected", selectedIngredients.includes(n));
  });
}

function renderChips() {
  const el = $("chips");
  if (!el) return;
  el.innerHTML = selectedIngredients.map((ing,i) =>
    `<span class="chip">${escapeHtml(capitalize(ing))}<button type="button" onclick="removeIngredient(${i})">×</button></span>`
  ).join("");
}
function renderHomeChips() {
  const el = $("homeChips");
  if (!el) return;
  el.innerHTML = selectedIngredients.map((ing,i) =>
    `<span class="chip">${escapeHtml(capitalize(ing))}<button type="button" onclick="removeIngredient(${i})">×</button></span>`
  ).join("");
  document.querySelectorAll("#homeIngredientChips .choice-chip").forEach(btn => {
    btn.classList.toggle("selected", selectedIngredients.includes(normalizeIngredient(btn.dataset.ing)));
  });
  syncSuggestChips();
}

/* ---------- Modal / Recipe page ---------- */

function showRecipe(id) {
  const meal = meals.find(r => String(r.id) === String(id))
    || rankedResults.find(r => String(r.id) === String(id));
  if (!meal) return;

  const match = ingredientMatch(meal);
  const steps = meal.steps || [];
  let localServings = meal.baseServings || 4;
  const base = meal.baseServings || 4;
  const ings = meal.ingredients || [];
  const similar = (rankedResults.length ? rankedResults : meals)
    .filter(m => String(m.id) !== String(id) && (m.type === meal.type || m.keys?.some(k => meal.keys?.includes(k))))
    .slice(0, 6);
  const isSaved = saved.includes(String(meal.id));

  const body = $("recipePageBody");
  if (!body) return;

  const renderIngGroup = (list) => list.map(ing =>
    `<li style="padding:6px 0;border-bottom:1px solid var(--line);">${escapeHtml(ing)}</li>`
  ).join("") || "<li style='color:#888'>None</li>";

  const roles = splitIngredientsByRole(ings);
  const allMissingLines = roles.core.concat(roles.supporting).filter(line => {
    const rawTok = String(line).split(",")[0].replace(/^\d+[\d\s\/¼½¾⅓⅔⅛⅜⅝⅞.]*\s*(cups?|tbsp|tsp|tablespoons?|teaspoons?|pounds?|lbs?|ounces?|oz|grams?|g|large|medium|small|racks?|pieces?)?\.?\s*/i, "").trim();
    const tok = normalizeIngredient(rawTok) || normalizeText(line).slice(0, 40);
    if (PANTRY_SET.has(normalizeIngredient(tok))) return false;
    if (["oil","salt","pepper","water","spice","herb"].includes(familyOf(tok))) return false;
    return selectedIngredients.every(s => !tokensMatch(s, tok));
  });

  const renderAllRoles = (coreL, suppL, panL) => `
      <h4 style="margin:12px 0 6px;font-size:0.95rem;color:var(--brand);">Core ingredients</h4>
      <ul class="ing-check" style="list-style:none;padding:0;margin:0 0 12px;">${renderIngGroup(coreL)}</ul>
      <h4 style="margin:12px 0 6px;font-size:0.95rem;color:var(--ink-soft);">Supporting ingredients</h4>
      <ul class="ing-check" style="list-style:none;padding:0;margin:0 0 12px;">${renderIngGroup(suppL)}</ul>
      ${panL.length ? `<h4 style="margin:12px 0 6px;font-size:0.95rem;color:var(--ink-soft);">Pantry / staples</h4>
      <ul class="ing-check" style="list-style:none;padding:0;margin:0 0 12px;">${renderIngGroup(panL)}</ul>` : ""}
  `;

  body.innerHTML = `
    <div class="recipe-layout">
      <div class="recipe-hero">
        <img src="${escapeHtml(upgradeImageUrl(meal.image||meal.fallbackImage))}" data-fallback="${escapeHtml(upgradeImageUrl(meal.fallbackImage))}" onerror="handleImageError(this)" alt="${escapeHtml(meal.name)}">
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <span class="eyebrow">${escapeHtml(capitalize(meal.type))}</span>
            <h2 style="font-family:var(--display);font-size:clamp(1.4rem,3.5vw,1.9rem);margin:6px 0 10px;line-height:1.15;">${escapeHtml(meal.name)}</h2>
          </div>
          <button type="button" id="pageFavBtn" class="primary-btn" style="min-width:130px;font-size:1rem;padding:12px 16px;">
            ${isSaved ? "♥ In favorites" : "♡ Add to favorites"}
          </button>
        </div>
    <div class="modal-stats" id="pageNutritionStats">
      <b>${meal.cal!=null?Math.round(meal.cal)+" kcal / serving":"—"}</b>
      <b>${meal.protein!=null?Math.round(meal.protein)+"g protein / serving":"—"}</b>
      <b>${meal.cal!=null?"Total "+Math.round(meal.cal * localServings)+" kcal":"—"}</b>
      <b>${meal.protein!=null?"Total "+Math.round(meal.protein * localServings)+"g protein":"—"}</b>
      <b>${meal.time} min</b>
    </div>
    <div style="font-size:13px;color:#666;margin:6px 0 12px;" id="pageNutritionNote">Showing <strong>${localServings} serving${localServings>1?"s":""}</strong> — change servings to scale ingredients & totals${meal.estimated?" · USDA est.":""}</div>

    <div class="servings-ctrl">
      <span>Scale ingredients for</span>
      <button type="button" id="servMinus">−</button>
      <span id="pageServingsVal">${localServings}</span>
      <button type="button" id="servPlus">+</button>
      <span style="font-weight:500;color:#666;">servings</span>
    </div>

    ${selectedIngredients.length ? `
      <div class="have-missing" id="pageHaveMissing">
        <div class="hm-box have"><h5>Requested ingredients</h5>${(match.requestedHave||match.have||[]).length?(match.requestedHave||match.have).map(i=>"✓ "+capitalize(i)).join("<br>"):"—"}
          ${(match.requestedMissing||[]).length?"<br><span style=\"color:#b00020\">✗ "+match.requestedMissing.map(capitalize).join(", ")+"</span>":""}</div>
        <div class="hm-box miss" id="pageYoullNeed"><h5>You'll need</h5>
          <div id="needPreview" class="need-preview"></div>
          <button type="button" class="mini-btn need-expand-btn" id="needExpandBtn" hidden>Show all +</button>
        </div>
      </div>` : ""}

    <h3 style="margin:18px 0 10px;font-size:1.15rem;">Ingredients</h3>
    <div id="pageIngList">${renderAllRoles(roles.core, roles.supporting, roles.pantry)}</div>

    <h3 style="margin:22px 0 10px;font-size:1.15rem;">Instructions</h3>
    ${steps.length
      ? `<ol class="steps-list">${steps.map((s,i)=>`<li style="margin-bottom:12px;"><strong style="color:var(--brand);">Step ${i+1}.</strong> ${escapeHtml(s)}</li>`).join("")}</ol>`
      : `<p style="color:#888;">No step-by-step instructions available for this recipe.</p>`}

    <div class="modal-actions" style="margin-top:24px;">
      <button type="button" class="secondary-btn" id="pageSimilar">🔄 Similar meals</button>
      <button type="button" class="secondary-btn" id="pagePlan">📅 Meal plan</button>
    </div>
      </div>
    </div>

    ${similar.length ? `
      <div class="similar-section">
        <h3 style="margin-bottom:10px;">You might also like</h3>
        <div class="similar-grid">
          ${similar.map(s => `<div class="similar-card" data-id="${escapeHtml(String(s.id))}">
            <img src="${escapeHtml(s.image||s.fallbackImage||"")}" alt="" loading="lazy" onerror="handleImageError(this)" data-fallback="${escapeHtml(s.fallbackImage||"")}">
            <span class="similar-card-name">${escapeHtml(s.name)}</span>
          </div>`).join("")}
        </div>
      </div>` : ""}
  `;

  showView("recipe", { skipUrl: true });
  const rPath = recipePath(meal);
  navigateTo(rPath, { replace: false });
  setPageMeta({
    title: meal.name,
    description: `Recipe for ${meal.name}. About ${meal.cal != null ? Math.round(meal.cal) + " kcal" : "nutrition varies"} per serving · ${meal.time || "?"} min.`,
    path: rPath,
    image: meal.image || meal.fallbackImage || (SITE_ORIGIN + "/og-image.svg")
  });
  setRecipeSchema(meal, rPath);
  trackEvent("recipe_view", { recipe_id: String(meal.id), recipe_name: meal.name, recipe_type: meal.type });

  const redrawIngs = () => {
    const factor = localServings / base;
    const scaled = scaleIngredientsList(meal.ingredients, factor);
    const r = splitIngredientsByRole(scaled);
    const box = $("pageIngList");
    if (box) box.innerHTML = renderAllRoles(r.core, r.supporting, r.pantry);
    const lab = $("pageServingsVal");
    if (lab) lab.textContent = localServings;
    // Scale nutrition (stored values are per 1 serving of base recipe yield)
    const perBaseServingCal = meal.cal;
    const perBaseServingP = meal.protein;
    const perBaseServingC = meal.carbs;
    const perBaseServingF = meal.fat;
    // Show per-serving relative to current scale: full recipe * factor / localServings = same per serving of base
    // User expectation: changing servings changes TOTAL and per-portion display for what they're cooking
    const totalCal = perBaseServingCal != null ? Math.round(perBaseServingCal * localServings) : null;
    const totalP = perBaseServingP != null ? Math.round(perBaseServingP * localServings) : null;
    const totalC = perBaseServingC != null ? Math.round(perBaseServingC * localServings) : null;
    const totalF = perBaseServingF != null ? Math.round(perBaseServingF * localServings) : null;
    const perCal = perBaseServingCal != null ? Math.round(perBaseServingCal) : null; // 1 serving of original
    const stats = $("pageNutritionStats");
    if (stats) {
      stats.innerHTML = `
        <b>${perCal!=null?perCal+" kcal / serving":"—"}</b>
        <b>${perBaseServingP!=null?Math.round(perBaseServingP)+"g protein / serving":"—"}</b>
        <b>${totalCal!=null?"Total "+totalCal+" kcal":"—"}</b>
        <b>${totalP!=null?"Total "+totalP+"g protein":"—"}</b>
        <b>${meal.time} min</b>`;
    }
    const note = $("pageNutritionNote");
    if (note) {
      note.innerHTML = `Showing <strong>${localServings} serving${localServings>1?"s":""}</strong> (base ${base}) — quantities scaled including weights in parentheses · totals for this batch${meal.estimated?" · estimated nutrition":""}`;
    }
    const needBox = $("pageYoullNeed");
    if (needBox && selectedIngredients.length) {
      const needLines = scaled.filter(line => {
        const tok = normalizeIngredient(String(line).split(",")[0]);
        if (PANTRY_SET.has(normalizeIngredient(tok))) return false;
        return selectedIngredients.every(s => !tokensMatch(s, tok));
      }).slice(0, 10);
      needBox.innerHTML = `<h5>You'll need</h5>${needLines.length ? needLines.map(l => "• " + escapeHtml(l)).join("<br>") : "Nothing extra — pantry staples only"}`;
    }
  };
  if ($("servMinus")) $("servMinus").onclick = () => { localServings = Math.max(1, localServings - 1); redrawIngs(); };
  if ($("servPlus")) $("servPlus").onclick = () => { localServings = Math.min(16, localServings + 1); redrawIngs(); };
  
  if ($("servReset")) $("servReset").onclick = () => { localServings = base; redrawIngs(); showToast("Servings reset to recipe base"); };

  // You'll need: show first 4, expand for all
  const fillNeed = (expanded) => {
    const box = $("needPreview");
    const btn = $("needExpandBtn");
    const wrap = $("pageYoullNeed");
    if (!box) return;
    if (match.canMakeNow || !allMissingLines.length) {
      box.innerHTML = match.canMakeNow ? "Nothing extra — pantry staples only" : "—";
      if (btn) btn.hidden = true;
      if (wrap) wrap.classList.remove("need-expanded");
      return;
    }
    const collapsedCount = 3;
    const limit = expanded ? allMissingLines.length : collapsedCount;
    const shown = allMissingLines.slice(0, limit);
    box.innerHTML = shown.map(line => `<div class="need-line">• ${escapeHtml(line)}</div>`).join("");
    if (wrap) wrap.classList.toggle("need-expanded", !!expanded);
    if (btn) {
      if (allMissingLines.length > collapsedCount) {
        btn.hidden = false;
        btn.textContent = expanded
          ? "Show less −"
          : `Show all ${allMissingLines.length} missing ingredients +`;
        btn.onclick = () => fillNeed(!expanded);
      } else {
        btn.hidden = true;
      }
    }
  };
  fillNeed(false);


  if ($("pageFavBtn")) $("pageFavBtn").onclick = () => {
    toggleSave(meal.id);
    const on = saved.includes(String(meal.id));
    $("pageFavBtn").textContent = on ? "♥ In favorites" : "♡ Add to favorites";
  };
  if ($("pageSimilar")) $("pageSimilar").onclick = () => {
    rankedResults = (rankedResults.length?rankedResults:meals)
      .filter(m => String(m.id) !== String(meal.id) && m.keys?.some(k => meal.keys?.includes(k)))
      .map(m => ({...m, score: scoreMeal(m), match: ingredientMatch(m)}));
    renderMeals("mealGrid", rankedResults);
    showView("home");
    showToast("Showing similar meals");
  };
  if ($("pagePlan")) $("pagePlan").onclick = () => openDayPicker(meal.id);
  body.querySelectorAll(".similar-card").forEach(c => {
    c.onclick = () => showRecipe(c.dataset.id);
  });
}

window.showRecipe = showRecipe;

/* ---------- Saved ---------- */
function toggleSave(id) {
  const rid = String(id);
  if (saved.includes(rid)) {
    saved = saved.filter(x => x !== rid);
    showToast("Removed from favorites");
    trackEvent("recipe_unfavorite", { recipe_id: rid });
  } else {
    saved.push(rid);
    showToast("Added to favorites ❤️");
    trackEvent("recipe_favorite", { recipe_id: rid });
  }
  localStorage.setItem("wcieSaved", JSON.stringify(saved));
  if ($("savedCount")) $("savedCount").textContent = saved.length;
  renderMeals();
  if ($("view-favorites")?.classList.contains("active")) renderFavoritesPage();
  if ($("favoritesGrid") && $("view-favorites")?.classList.contains("active")) renderMeals("favoritesGrid");
}
window.toggleSave = toggleSave;

/* ---------- Planner ---------- */
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

async function generateWeeklyPlan(useMine=false) {
  preferMyIngredients = !!useMine;
  trackEvent("meal_plan_generate", { mode: useMine ? "use_ingredients" : "random" });
  const dailyCal = Number($("plannerCalories")?.value) || 2100;
  const dailyP = Number($("plannerProtein")?.value) || 150;
  const mealsPerDay = Number($("plannerMeals")?.value) || 3;
  const planDiet = $("plannerDiet")?.value || "any";

  // Random plan must IGNORE selected ingredients entirely.
  // Pull a fresh unfiltered batch from the catalog so results aren't stuck on last search.
  let baseList = [];
  if (!useMine) {
    try {
      showToast("Building a random week…");
      const page = Math.floor(Math.random() * 40); // random window into catalog
      const from = page * 50;
      const to = from + 119; // ~120 recipes
      const { data, error } = await supabaseClient
        .from(TABLE_NAME)
        .select("*")
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      baseList = (data || []).map(convertRecipe);
      // Keep a broader meal cache without replacing ingredient search results entirely
      baseList.forEach(m => {
        if (!meals.some(x => String(x.id) === String(m.id))) meals.push(m);
      });
    } catch (err) {
      console.error(err);
      baseList = meals.slice();
    }
    // Shuffle
    for (let i = baseList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [baseList[i], baseList[j]] = [baseList[j], baseList[i]];
    }
  } else {
    baseList = (rankedResults.length ? rankedResults : meals).slice();
  }

  let pool = baseList
    .filter(m => m && m.cal > 0 && m.protein != null)
    .map(m => ({ ...m, match: ingredientMatch(m), dietTags: m.dietTags || detectDietTags(m) }));
  if (useMine && selectedIngredients.length) {
    pool = pool.filter(m => (m.match?.matched || 0) > 0);
    pool.sort((a, b) => (b.match?.matchRate || 0) - (a.match?.matchRate || 0));
  } else {
    // True random order — no ingredient bias
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  if (planDiet !== "any") pool = pool.filter(m => (m.dietTags || []).includes(planDiet));

  if (!pool.length) {
    $("weeklyPlan").innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Load recipes first</h3><p>Go to Recipes or Home and search, then return here.</p></div>`;
    return;
  }

  const types = mealsPerDay === 3 ? ["breakfast","lunch","dinner"]
    : mealsPerDay === 4 ? ["breakfast","lunch","snack","dinner"]
    : ["breakfast","snack","lunch","snack","dinner"];
  const dist = mealsPerDay === 3 ? [0.25,0.4,0.35] : mealsPerDay === 4 ? [0.2,0.35,0.15,0.3] : [0.2,0.1,0.3,0.1,0.3];

  weeklyPlanData = [];
  let html = "";
  let weekCal = 0, weekP = 0;

  const weekUsage = {}; // id -> count (max 2 per week — prefer unique)
  DAYS.forEach((day, dayIndex) => {
    let dayCal = 0, dayP = 0;
    const usedToday = new Set();
    const dayMeals = [];
    for (let i = 0; i < mealsPerDay; i++) {
      const tCal = dailyCal * dist[i];
      const tP = dailyP / mealsPerDay;
      let cands = pool.filter(r => {
        const id = String(r.id);
        if (usedToday.has(id)) return false;
        if ((weekUsage[id] || 0) >= 2) return false;
        return true;
      });
      const typed = cands.filter(r => r.type === types[i]);
      if (typed.length >= 3) cands = typed;
      else if (typed.length) cands = [...typed, ...cands.filter(r => r.type !== types[i])];
      // Prefer meals that keep remaining day budget feasible
      const remainingSlots = mealsPerDay - i;
      cands = [...cands].sort((a,b) => {
        const aCal = a.cal || 0, bCal = b.cal || 0;
        // score closeness to slot target + prefer unused + random
        let as = Math.abs(aCal - tCal) / Math.max(tCal, 1) * 60 + Math.abs((a.protein||0) - tP) / Math.max(tP, 1) * 30;
        let bs = Math.abs(bCal - tCal) / Math.max(tCal, 1) * 60 + Math.abs((b.protein||0) - tP) / Math.max(tP, 1) * 30;
        as += (weekUsage[String(a.id)] || 0) * 40; // strongly prefer not-yet-used
        bs += (weekUsage[String(b.id)] || 0) * 40;
        if (useMine) { as -= (a.match?.matchRate||0) * 0.45; bs -= (b.match?.matchRate||0) * 0.45; }
        as += Math.random() * 12; bs += Math.random() * 12;
        return as - bs;
      });
      // try find pick that won't force day under target-100 or way over
      let pick = null;
      for (const c of cands) {
        const nextCal = dayCal + (c.cal || 0);
        const maxLeft = dailyCal - nextCal; // remaining after this pick for other slots
        // last meal: day total must be in [dailyCal-100, dailyCal+80]
        if (i === mealsPerDay - 1) {
          const nextP = dayP + (c.protein || 0);
          if (Math.abs(nextCal - dailyCal) <= 100 && Math.abs(nextP - dailyP) <= 15) { pick = c; break; }
        } else {
          // leave room for remaining slots
          if (maxLeft >= (remainingSlots - 1) * 100 && nextCal <= dailyCal + 100) { pick = c; break; }
        }
      }
      if (!pick) pick = cands[0];
      if (!pick) continue;
      const id = String(pick.id);
      usedToday.add(id);
      weekUsage[id] = (weekUsage[id] || 0) + 1;
      dayCal += pick.cal || 0;
      dayP += pick.protein || 0;
      dayMeals.push({ meal: pick, type: types[i] });
    }
    // Enforce day totals: calories ±100, protein ±15g — swap meals until in range
    const calOK = (c) => Math.abs(c - dailyCal) <= 100;
    const protOK = (pr) => Math.abs(pr - dailyP) <= 15;
    if (dayMeals.length) {
      let tries = 0;
      while (tries < 25 && (!calOK(dayCal) || !protOK(dayP))) {
        tries++;
        // Replace the meal that is furthest from its fair share
        let worstIdx = dayMeals.length - 1;
        let worstScore = -1;
        for (let mi = 0; mi < dayMeals.length; mi++) {
          const fairCal = dailyCal / dayMeals.length;
          const fairP = dailyP / dayMeals.length;
          const sc = Math.abs((dayMeals[mi].meal.cal || 0) - fairCal) + Math.abs((dayMeals[mi].meal.protein || 0) - fairP) * 2;
          if (sc > worstScore) { worstScore = sc; worstIdx = mi; }
        }
        const slot = dayMeals[worstIdx];
        const othersCal = dayCal - (slot.meal.cal || 0);
        const othersP = dayP - (slot.meal.protein || 0);
        const needCal = dailyCal - othersCal;
        const needP = dailyP - othersP;
        let best = null;
        let bestDiff = Infinity;
        for (const r of pool) {
          const id = String(r.id);
          if (id === String(slot.meal.id)) continue;
          if (usedToday.has(id) && id !== String(slot.meal.id)) continue;
          if ((weekUsage[id] || 0) >= 2) continue;
          const c = r.cal || 0;
          const pr = r.protein || 0;
          const newDayCal = othersCal + c;
          const newDayP = othersP + pr;
          if (!calOK(newDayCal) || !protOK(newDayP)) {
            // still consider closer options
            const diff = Math.abs(newDayCal - dailyCal) + Math.abs(newDayP - dailyP) * 3;
            if (diff < bestDiff) { bestDiff = diff; best = r; }
            continue;
          }
          const diff = Math.abs(c - needCal) + Math.abs(pr - needP) * 2;
          if (diff < bestDiff) { bestDiff = diff; best = r; }
        }
        if (!best) break;
        weekUsage[String(slot.meal.id)] = Math.max(0, (weekUsage[String(slot.meal.id)] || 1) - 1);
        usedToday.delete(String(slot.meal.id));
        usedToday.add(String(best.id));
        weekUsage[String(best.id)] = (weekUsage[String(best.id)] || 0) + 1;
        dayCal = othersCal + (best.cal || 0);
        dayP = othersP + (best.protein || 0);
        slot.meal = best;
        if (calOK(dayCal) && protOK(dayP)) break;
      }
    }
    // Final gate: only accept day if within tolerance
    if (!calOK(dayCal) || !protOK(dayP)) {
      // one more aggressive reshuffle of all slots from pool
      const fresh = pool.filter(r => (weekUsage[String(r.id)] || 0) < 2)
        .sort(() => Math.random() - 0.5);
      for (let attempt = 0; attempt < 40; attempt++) {
        const picks = [];
        let cSum = 0, pSum = 0;
        const used = new Set();
        let ok = true;
        for (let s = 0; s < mealsPerDay; s++) {
          const needC = (dailyCal - cSum) / (mealsPerDay - s);
          const needPr = (dailyP - pSum) / (mealsPerDay - s);
          const cand = fresh.find(r => {
            const id = String(r.id);
            if (used.has(id)) return false;
            const c = r.cal || 0, pr = r.protein || 0;
            if (s < mealsPerDay - 1) return c >= 80 && c <= needC + 150;
            return Math.abs(cSum + c - dailyCal) <= 100 && Math.abs(pSum + pr - dailyP) <= 15;
          });
          if (!cand) { ok = false; break; }
          used.add(String(cand.id));
          picks.push(cand);
          cSum += cand.cal || 0;
          pSum += cand.protein || 0;
        }
        if (ok && calOK(cSum) && protOK(pSum)) {
          dayMeals.forEach((slot, mi) => {
            const oldId = String(slot.meal.id);
            weekUsage[oldId] = Math.max(0, (weekUsage[oldId] || 1) - 1);
            slot.meal = picks[mi];
            weekUsage[String(picks[mi].id)] = (weekUsage[String(picks[mi].id)] || 0) + 1;
          });
          dayCal = cSum;
          dayP = pSum;
          break;
        }
      }
    }
    weekCal += dayCal; weekP += dayP;
    weeklyPlanData.push({ day, dayCal, dayP, meals: dayMeals });
    const onTarget = calOK(dayCal) && protOK(dayP);
    html += `<div class="day-card" data-day="${dayIndex}">
      <div class="day-header">${day}</div>
      <div class="day-stats ${onTarget?"on-target":""}">${Math.round(dayCal)} kcal · ${Math.round(dayP)}g protein ${onTarget?"✓":""}</div>
      ${dayMeals.map((slot, mi) => `
        <div class="planner-meal">
          <div class="planner-meal-row">
            <img class="planner-thumb" src="${escapeHtml(slot.meal.image||slot.meal.fallbackImage||"")}" alt="" onerror="handleImageError(this)" data-fallback="${escapeHtml(slot.meal.fallbackImage||"")}">
            <div style="flex:1;min-width:0;">
              <div class="planner-meal-type">${escapeHtml(capitalize(slot.type))}</div>
              <div class="planner-meal-name" onclick="showRecipe('${escapeHtml(String(slot.meal.id))}')">${escapeHtml(slot.meal.name)}</div>
              <div class="planner-meal-info">${Math.round(slot.meal.cal)} kcal · ${Math.round(slot.meal.protein)}g protein</div>
            </div>
          </div>
          <div class="planner-meal-actions">
            <button type="button" class="mini-btn" onclick="replacePlanMeal(${dayIndex},${mi})">🔄 Replace</button>
          </div>
          <div class="alt-panel" id="alt-${dayIndex}-${mi}" hidden></div>
        </div>`).join("")}
    </div>`;
  });

  $("weeklyPlan").innerHTML = html;
  if ($("planSummary")) {
    $("planSummary").innerHTML = `<div style="font-size:1.05rem;font-weight:700;margin-bottom:6px;">🎯 Daily target: ${dailyCal.toLocaleString()} kcal · ${dailyP}g protein</div>
      <div>Week average: ${Math.round(weekCal/7)} kcal · ${Math.round(weekP/7)}g protein ${useMine ? "· using your ingredients" : "· random balanced meals"}</div>`;
  }
  // store for shopping day filter
  window._planDailyTarget = { cal: dailyCal, protein: dailyP };
  showToast(useMine ? "Plan built around your ingredients (max 2× any meal) ✨" : "Random week plan ready — unique meals preferred ✨");
}

window.replacePlanMeal = function(dayIndex, mealIndex) {
  const panel = $(`alt-${dayIndex}-${mealIndex}`);
  if (!panel) return;
  if (!panel.hidden && panel.innerHTML) { panel.hidden = true; return; }
  const current = weeklyPlanData[dayIndex]?.meals[mealIndex]?.meal;
  if (!current) return;
  const alts = (rankedResults.length ? rankedResults : meals)
    .filter(m => String(m.id) !== String(current.id) && Math.abs((m.cal||0)-(current.cal||0)) < 180)
    .slice(0, 5);
  if (!alts.length) { panel.innerHTML = "<p style='font-size:13px;'>No close alternatives in the current list. Search more recipes first.</p>"; panel.hidden = false; return; }
  panel.innerHTML = `<strong style="font-size:12px;">Alternatives (~same calories)</strong>` + alts.map(a =>
    `<div class="alt-item" onclick="applyPlanReplacement(${dayIndex},${mealIndex},${a.id})">
      <img src="${escapeHtml(a.image||a.fallbackImage||"")}" alt="" onerror="handleImageError(this)" data-fallback="${escapeHtml(a.fallbackImage||"")}">
      <div><div style="font-weight:600;">${escapeHtml(a.name)}</div>
      <div style="font-size:0.8rem;color:var(--ink-soft);">${Math.round(a.cal)} kcal · ${Math.round(a.protein)}g protein</div></div>
    </div>`
  ).join("");
  panel.hidden = false;
};

window.applyPlanReplacement = function(dayIndex, mealIndex, newId) {
  const neu = meals.find(m => String(m.id) === String(newId))
    || rankedResults.find(m => String(m.id) === String(newId))
    || nameResults.find(m => String(m.id) === String(newId));
  if (!neu || !weeklyPlanData[dayIndex]) return;
  weeklyPlanData[dayIndex].meals[mealIndex].meal = neu;
  renderWeeklyPlanFromData();
  showToast("Meal replaced"); trackEvent("meal_replace");
};

/* ---------- Shopping list ---------- */
function buildShoppingList(filterDays) {
  trackEvent("grocery_generate");
  // filterDays: null/empty = all days, or array of day indexes 0-6
  if (!weeklyPlanData.length) {
    showToast("Generate a weekly plan first");
    return;
  }
  const days = Array.isArray(filterDays) && filterDays.length
    ? filterDays
    : weeklyPlanData.map((_, i) => i);

  // Build per-day lists + combined
  const byDay = [];
  const combined = {};

  days.forEach(di => {
    const d = weeklyPlanData[di];
    if (!d) return;
    const dayItems = {};
    d.meals.forEach(slot => {
      (slot.meal.ingredients || []).forEach(line => {
        const raw = String(line).trim();
        if (!raw) return;
        const qtyMatch = raw.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)(\s*(?:cups?|tbsp|tsp|tablespoons?|teaspoons?|pounds?|lbs?\.?|ounces?|oz\.?|grams?|g|large|medium|small|cloves?|cans?|slices?)\.?)?/i);
        let qtyStr = qtyMatch ? (qtyMatch[1] + (qtyMatch[2] || "")).trim() : "";
        const namePart = raw.replace(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)(\s*(?:cups?|tbsp|tsp|tablespoons?|teaspoons?|pounds?|lbs?\.?|ounces?|oz\.?|grams?|g|large|medium|small|cloves?|cans?|slices?)\.?)?\s*/i, "").split(",")[0].trim();
        const key = normalizeIngredient(namePart) || normalizeText(namePart).slice(0, 48);
        if (!key || key.length < 2) return;
        if (typeof PANTRY_SET !== "undefined" && PANTRY_SET.has(key)) return;
        if (["salt","pepper","oil","water"].includes(key)) return;
        if (!dayItems[key]) dayItems[key] = { name: capitalize(key), qtyParts: [], count: 0 };
        dayItems[key].count++;
        if (qtyStr) dayItems[key].qtyParts.push(qtyStr);
        if (!combined[key]) combined[key] = { name: capitalize(key), qtyParts: [], count: 0 };
        combined[key].count++;
        if (qtyStr) combined[key].qtyParts.push(qtyStr);
      });
    });
    byDay.push({
      dayIndex: di,
      dayName: d.day,
      items: Object.values(dayItems).sort((a,b) => b.count - a.count).map(x => ({
        name: x.name,
        detail: x.qtyParts.length ? (x.qtyParts.length > 1 && new Set(x.qtyParts).size === 1 ? `${x.qtyParts[0]} × ${x.qtyParts.length}` : [...new Set(x.qtyParts)].join(" + ")) : `×${x.count}`,
        checked: false
      }))
    });
  });

  window._shopByDay = byDay;
  shopItems = Object.values(combined)
    .sort((a,b) => b.count - a.count)
    .map(x => ({
      name: x.name,
      detail: x.qtyParts.length ? (x.qtyParts.length > 1 && new Set(x.qtyParts).size === 1 ? `${x.qtyParts[0]} × ${x.qtyParts.length}` : [...new Set(x.qtyParts)].slice(0,4).join(" + ")) : `for ${x.count} meals`,
      checked: false
    }));
  localStorage.setItem("wcieShop", JSON.stringify(shopItems));
  renderShopList(shopViewMode === "days");
  showToast(shopViewMode === "merged" ? "Merged grocery list ready" : "Grocery list by day ready");
}

function renderShopList(preferDays) {
  const ul = $("shopList");
  if (!ul) return;
  const byDay = window._shopByDay;

  if (preferDays && byDay && byDay.length) {
    ul.innerHTML = byDay.map(d => `
      <li style="list-style:none;border:none;padding:0;margin:0 0 18px;">
        <h3 style="font-size:1rem;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid var(--brand);">${escapeHtml(d.dayName)}</h3>
        <ul class="shop-list" style="margin:0;">
          ${d.items.length ? d.items.map((item, i) => `
            <li class="shop-item ${item.checked?"checked":""}">
              <input type="checkbox" ${item.checked?"checked":""} onchange="toggleShopDayItem(${d.dayIndex},${i})">
              <span class="shop-name">${escapeHtml(item.name)}</span>
              <span class="shop-qty">${escapeHtml(item.detail||"")}</span>
            </li>`).join("") : `<li class="shop-item"><span class="shop-name" style="color:#888">No items</span></li>`}
        </ul>
      </li>`).join("");
    return;
  }

  if (!shopItems.length) {
    ul.innerHTML = `<li class="empty-state" style="border:none;">Generate a meal plan first, then build your grocery list.</li>`;
    return;
  }
  const coreItems = shopItems.filter(x => classifyRecipeIngredient(x.name) === "core");
  const supportItems = shopItems.filter(x => classifyRecipeIngredient(x.name) !== "core");
  const renderGroup = (arr, offset) => arr.map((item, i) => {
    const idx = shopItems.indexOf(item);
    return `<li class="shop-item ${item.checked?"checked":""}">
      <input type="checkbox" ${item.checked?"checked":""} onchange="toggleShopItem(${idx})">
      <span class="shop-name">${escapeHtml(item.name)}</span>
      <span class="shop-qty">${escapeHtml(item.detail||"")}</span>
    </li>`;
  }).join("");
  ul.innerHTML = `
    <li style="list-style:none;border:none;padding:0;"><div class="shop-section-title">Core ingredients</div></li>
    ${coreItems.length ? renderGroup(coreItems) : "<li class='shop-item'><span class='shop-name' style='color:#888'>None</span></li>"}
    <li style="list-style:none;border:none;padding:0;"><div class="shop-section-title">Supporting ingredients</div></li>
    ${supportItems.length ? renderGroup(supportItems) : "<li class='shop-item'><span class='shop-name' style='color:#888'>None</span></li>"}
  `;
}

window.toggleShopDayItem = function(dayIndex, i) {
  const byDay = window._shopByDay;
  if (!byDay) return;
  const day = byDay.find(d => d.dayIndex === dayIndex);
  if (!day || !day.items[i]) return;
  day.items[i].checked = !day.items[i].checked;
  renderShopList(true);
};

window.toggleShopItem = function(i) {
  if (!shopItems[i]) return;
  shopItems[i].checked = !shopItems[i].checked;
  trackEvent("grocery_item_check", { checked: !!shopItems[i].checked, item: shopItems[i].name });
  try {
    localStorage.setItem("wcieShop", JSON.stringify({
      savedAt: Date.now(),
      viewMode: shopViewMode,
      items: shopItems,
      byDay: window._shopByDay || null
    }));
  } catch {}
  renderShopList();
};

/* ---------- Toast & events ---------- */

/* ---------- Persist plan & grocery (localStorage, same idea as favorites) ---------- */
function mealSnapshot(m) {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    cal: m.cal,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    time: m.time,
    image: m.image,
    fallbackImage: m.fallbackImage,
    ingredients: m.ingredients,
    keys: m.keys,
    steps: m.steps,
    estimated: m.estimated,
    baseServings: m.baseServings,
    dietTags: m.dietTags
  };
}

function saveWeeklyPlan() {
  if (!weeklyPlanData.length) {
    showToast("Generate a plan first");
    return;
  }
  const payload = {
    savedAt: Date.now(),
    dailyCal: Number($("plannerCalories")?.value) || 2100,
    dailyP: Number($("plannerProtein")?.value) || 150,
    mealsPerDay: Number($("plannerMeals")?.value) || 3,
    diet: $("plannerDiet")?.value || "any",
    days: weeklyPlanData.map(d => ({
      day: d.day,
      dayCal: d.dayCal,
      dayP: d.dayP,
      meals: (d.meals || []).map(slot => ({
        type: slot.type,
        meal: mealSnapshot(slot.meal)
      }))
    }))
  };
  try {
    localStorage.setItem("wciePlan", JSON.stringify(payload));
    showToast("Meal plan saved locally on this device ✓"); trackEvent("meal_plan_save");
  } catch (e) {
    console.error(e);
    showToast("Could not save plan");
  }
}

function loadWeeklyPlan() {
  try {
    const raw = localStorage.getItem("wciePlan");
    if (!raw) {
      showToast("No saved plan found");
      return;
    }
    const payload = JSON.parse(raw);
    if (!payload?.days?.length) {
      showToast("Saved plan is empty");
      return;
    }
    if (payload.dailyCal && $("plannerCalories")) $("plannerCalories").value = payload.dailyCal;
    if (payload.dailyP && $("plannerProtein")) $("plannerProtein").value = payload.dailyP;
    if (payload.mealsPerDay && $("plannerMeals")) $("plannerMeals").value = String(payload.mealsPerDay);
    if (payload.diet && $("plannerDiet")) $("plannerDiet").value = payload.diet;

    weeklyPlanData = payload.days.map(d => ({
      day: d.day,
      dayCal: d.dayCal || 0,
      dayP: d.dayP || 0,
      meals: (d.meals || []).map(slot => {
        const snap = slot.meal;
        if (!snap) return { type: slot.type, meal: null };
        // Reattach to catalog meal if present (fresher data)
        let live = meals.find(m => String(m.id) === String(snap.id))
          || rankedResults.find(m => String(m.id) === String(snap.id));
        if (!live) {
          live = { ...snap };
          if (!meals.some(m => String(m.id) === String(live.id))) meals.push(live);
        }
        return { type: slot.type || live.type || "dinner", meal: live };
      })
    }));
    renderWeeklyPlanFromData();
    showView("planner");
    showToast("Meal plan loaded ✓");
  } catch (e) {
    console.error(e);
    showToast("Could not load plan");
  }
}

function saveGroceryList() {
  // Persist both merged shopItems and by-day lists
  const payload = {
    savedAt: Date.now(),
    viewMode: shopViewMode,
    items: shopItems,
    byDay: window._shopByDay || null
  };
  if ((!shopItems || !shopItems.length) && !(window._shopByDay && window._shopByDay.length)) {
    showToast("Grocery list is empty");
    return;
  }
  try {
    localStorage.setItem("wcieShop", JSON.stringify(payload));
    showToast("Grocery list saved locally on this device ✓"); trackEvent("grocery_save");
  } catch (e) {
    console.error(e);
    showToast("Could not save list");
  }
}

function loadGroceryList() {
  try {
    const raw = localStorage.getItem("wcieShop");
    if (!raw) return false;
    const data = JSON.parse(raw);
    // Legacy: plain array of items
    if (Array.isArray(data)) {
      shopItems = data;
      window._shopByDay = null;
      renderShopList(false);
      return shopItems.length > 0;
    }
    if (data && typeof data === "object") {
      shopItems = Array.isArray(data.items) ? data.items : [];
      window._shopByDay = data.byDay || null;
      if (data.viewMode) shopViewMode = data.viewMode;
      renderShopList(shopViewMode === "days" && window._shopByDay);
      return true;
    }
  } catch (e) {
    console.error(e);
  }
  return false;
}


function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toast);
  window._toast = setTimeout(() => t.classList.remove("show"), 2000);
}


function renderFavoritesPage() {
  const grid = $("favoritesGrid");
  const meta = $("favoritesMeta");
  if (!grid) return;
  if (!saved.length) {
    if (meta) meta.textContent = "No favorites yet — open a recipe and add it.";
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">♡</div><h3>No favorites yet</h3><p>Tap “Add to favorites” on any recipe.</p></div>`;
    return;
  }
  let list = meals.filter(m => saved.includes(String(m.id)));
  // also from rankedResults
  const more = rankedResults.filter(m => saved.includes(String(m.id)) && !list.some(x => String(x.id)===String(m.id)));
  list = [...list, ...more];
  if (!list.length) {
    if (meta) meta.textContent = `${saved.length} saved — load recipes to display them.`;
    grid.innerHTML = `<div class="empty-state"><p>Your favorites are saved. Search once so we can load their details.</p>
      <button type="button" class="primary-btn" id="favLoadBtn">Load recipes</button></div>`;
    setTimeout(() => {
      if ($("favLoadBtn")) $("favLoadBtn").onclick = () => searchRecipes(true).then(() => renderFavoritesPage());
    }, 0);
    return;
  }
  if (meta) meta.textContent = `${list.length} favorite meal${list.length>1?"s":""}`;
  rankedResults = list.map(m => ({...m, score: 0, match: ingredientMatch(m)}));
  renderMeals("favoritesGrid", rankedResults);
}


/* ---------- Theme ---------- */
function initTheme() {
  const saved = localStorage.getItem("wcieTheme") || "day";
  document.documentElement.setAttribute("data-theme", saved);
  const btn = $("themeToggle");
  if (btn) btn.textContent = saved === "night" ? "☀️" : "🌙";
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "day";
  const next = cur === "day" ? "night" : "day";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("wcieTheme", next);
  const btn = $("themeToggle");
  if (btn) btn.textContent = next === "night" ? "☀️" : "🌙";
}

/* ---------- Search by name (Recipes page) ---------- */

function filterNameBatch(batch) {
  const diet = $("nameDietFilter")?.value || "any";
  const mtype = $("nameMealType")?.value || "any";
  const maxTime = Number($("nameTime")?.value) || 999;
  const targetCal = Number($("nameCalories")?.value) || 0;
  const targetP = Number($("nameProtein")?.value) || 0;
  const prefs = [...document.querySelectorAll(".namePref:checked")].map(x => x.value);
  return batch.filter(m => {
    if (diet !== "any" && !(m.dietTags || detectDietTags(m)).includes(diet)) return false;
    if (mtype !== "any" && m.type !== mtype) return false;
    if (m.time > maxTime) return false;
    if (prefs.includes("quick") && m.time > 20) return false;
    if (prefs.includes("high-protein") && (m.protein || 0) < 30) return false;
    if (prefs.includes("low-calorie") && (m.cal || 9999) > 500) return false;
    if (targetCal && m.cal != null && Math.abs(m.cal - targetCal) > 250) return false;
    if (targetP && m.protein != null && m.protein < targetP * 0.7) return false;
    return true;
  });
}

/** Load a random catalog window (used when search box is empty). */
async function loadRandomNameRecipes() {
  const grid = $("nameMealGrid");
  if (!grid) return;
  grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><h3>Loading recipes…</h3></div>`;
  try {
    const page = Math.floor(Math.random() * 50);
    const from = page * 40;
    const to = from + 59;
    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    let batch = (data || []).map(convertRecipe);
    for (let i = batch.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [batch[i], batch[j]] = [batch[j], batch[i]];
    }
    batch = filterNameBatch(batch);
    batch.forEach(m => {
      if (!meals.some(x => String(x.id) === String(m.id))) meals.push(m);
    });
    nameResults = batch;
    nameSearchPage = 0;
    nameSearchQuery = "";
    nameSearchHasMore = false;
    if ($("nameResultsTitle")) $("nameResultsTitle").textContent = `${nameResults.length} recipes`;
    if ($("nameMatchInfo")) $("nameMatchInfo").textContent = "Browsing the catalog — type a name to search, or shuffle for a new set.";
    renderMeals("nameMealGrid", nameResults.map(m => ({ ...m, score: Math.random(), match: ingredientMatch(m) })));
    if ($("nameLoadMoreBtn")) $("nameLoadMoreBtn").hidden = true;
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty-state"><h3>Could not load recipes</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function searchByName(reset = true) {
  trackEvent("recipe_search", { type: "name", query: ($("nameSearchInput")?.value || "").trim() });
  const q = ($("nameSearchInput")?.value || "").trim();
  const grid = $("nameMealGrid");
  if (!grid) return;

  // Empty query → show random catalog recipes (like Home auto-loads)
  if (!q) {
    await loadRandomNameRecipes();
    return;
  }

  if (reset) {
    nameSearchPage = 0;
    nameResults = [];
    nameSearchQuery = q;
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><h3>Searching…</h3></div>`;
  }
  try {
    const from = nameSearchPage * (PAGE_SIZE || 60);
    const to = from + (PAGE_SIZE || 60) - 1;
    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .ilike("dish_name", `%${q}%`)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    let batch = filterNameBatch((data || []).map(convertRecipe));
    nameSearchHasMore = (data || []).length === (PAGE_SIZE || 60);
    nameResults = reset ? batch : [...nameResults, ...batch];
    nameSearchPage++;
    batch.forEach(m => {
      if (!meals.some(x => String(x.id) === String(m.id))) meals.push(m);
    });
    if ($("nameResultsTitle")) $("nameResultsTitle").textContent = `${nameResults.length} meals found`;
    if ($("nameMatchInfo")) $("nameMatchInfo").textContent = nameSearchHasMore ? "Click load more meals for the next batch." : "All loaded results are shown.";
    renderMeals("nameMealGrid", nameResults.map(m => ({ ...m, score: 0, match: ingredientMatch(m) })));
    if ($("nameLoadMoreBtn")) {
      $("nameLoadMoreBtn").hidden = !nameSearchHasMore;
      $("nameLoadMoreBtn").textContent = nameSearchHasMore ? "Load more meals" : "No more meals";
    }
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty-state"><h3>Search failed</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

/* ---------- Add recipe to plan on chosen days ---------- */
function openDayPicker(mealId) {
  const meal = meals.find(m => String(m.id) === String(mealId))
    || rankedResults.find(m => String(m.id) === String(mealId));
  if (!meal) return showToast("Recipe not loaded");
  if (!weeklyPlanData.length) {
    // init empty week structure
    const types = ["breakfast","lunch","dinner"];
    weeklyPlanData = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day => ({
      day, dayCal: 0, dayP: 0, meals: types.map(t => ({ meal: null, type: t }))
    }));
  }
  const modal = document.createElement("div");
  modal.className = "day-picker";
  modal.innerHTML = `
    <div class="day-picker-box">
      <h3>Add to meal plan</h3>
      <p style="font-size:0.9rem;color:var(--ink-soft);margin-bottom:10px;">${escapeHtml(meal.name)}</p>
      <p style="font-size:0.85rem;margin-bottom:8px;">Choose day(s):</p>
      ${weeklyPlanData.map((d,i) => `
        <label><input type="checkbox" class="day-pick" value="${i}"> ${escapeHtml(d.day)}</label>
      `).join("")}
      <div class="field" style="margin-top:12px;">
        <label>Meal slot</label>
        <select id="dayPickSlot">
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
        </select>
      </div>
      <div class="btn-row" style="margin-top:14px;">
        <button type="button" class="primary-btn" id="dayPickConfirm">Add</button>
        <button type="button" class="secondary-btn" id="dayPickCancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector("#dayPickCancel").onclick = () => modal.remove();
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  modal.querySelector("#dayPickConfirm").onclick = () => {
    const days = [...modal.querySelectorAll(".day-pick:checked")].map(x => Number(x.value));
    const slot = modal.querySelector("#dayPickSlot")?.value || "dinner";
    if (!days.length) return showToast("Pick at least one day");
    days.forEach(di => {
      const day = weeklyPlanData[di];
      if (!day) return;
      let idx = day.meals.findIndex(m => m.type === slot);
      if (idx < 0) {
        day.meals.push({ meal, type: slot });
      } else {
        day.meals[idx] = { meal, type: slot };
      }
      day.dayCal = day.meals.reduce((s,x) => s + (x.meal?.cal || 0), 0);
      day.dayP = day.meals.reduce((s,x) => s + (x.meal?.protein || 0), 0);
    });
    renderWeeklyPlanFromData();
    modal.remove();
    showView("planner");
    showToast("Added to selected day(s)");
  };
}

function renderWeeklyPlanFromData() {
  const dailyCal = Number($("plannerCalories")?.value) || 2100;
  let weekCal = 0, weekP = 0;
  let html = "";
  weeklyPlanData.forEach((d, dayIndex) => {
    const dayCal = d.meals.reduce((s,x) => s + (x.meal?.cal || 0), 0);
    const dayP = d.meals.reduce((s,x) => s + (x.meal?.protein || 0), 0);
    d.dayCal = dayCal; d.dayP = dayP;
    weekCal += dayCal; weekP += dayP;
    const onTarget = dayCal > 0 && Math.abs(dayCal - dailyCal) <= 100;
    html += `<div class="day-card"><div class="day-header">${escapeHtml(d.day)}</div>
      <div class="day-stats ${onTarget?"on-target":""}">${Math.round(dayCal)} kcal · ${Math.round(dayP)}g protein ${onTarget?"✓":""}</div>
      ${d.meals.map((slot, mi) => slot.meal ? `
        <div class="planner-meal">
          <div class="planner-meal-row">
            <img class="planner-thumb" src="${escapeHtml(slot.meal.image||slot.meal.fallbackImage||"")}" alt="" onerror="handleImageError(this)" data-fallback="${escapeHtml(slot.meal.fallbackImage||"")}">
            <div style="flex:1;min-width:0;">
              <div class="planner-meal-type">${escapeHtml(capitalize(slot.type))}</div>
              <div class="planner-meal-name" onclick="showRecipe('${escapeHtml(String(slot.meal.id))}')">${escapeHtml(slot.meal.name)}</div>
              <div class="planner-meal-info">${Math.round(slot.meal.cal||0)} kcal · ${Math.round(slot.meal.protein||0)}g protein</div>
            </div>
          </div>
          <div class="planner-meal-actions">
            <button type="button" class="mini-btn" onclick="replacePlanMeal(${dayIndex},${mi})">🔄 Replace</button>
          </div>
          <div class="alt-panel" id="alt-${dayIndex}-${mi}" hidden></div>
        </div>` : `
        <div class="planner-meal" style="opacity:.6">
          <div class="planner-meal-type">${escapeHtml(capitalize(slot.type))}</div>
          <div class="planner-meal-info">Empty slot</div>
        </div>`
      ).join("")}
    </div>`;
  });
  if ($("weeklyPlan")) $("weeklyPlan").innerHTML = html;
  if ($("planSummary")) {
    $("planSummary").innerHTML = `<div style="font-size:1.05rem;font-weight:700;margin-bottom:6px;">🎯 Daily target: ${dailyCal.toLocaleString()} kcal</div>
      <div>Week average: ${Math.round(weekCal/7)} kcal · ${Math.round(weekP/7)}g protein</div>`;
  }
}



/* ---------- Typewriter hero ---------- */
const TYPE_PHRASES = [
  "Got ingredients? Let's cook.",
  "Your ingredients. Your meals. Your choice.",
  "Stop wondering what to eat."
];

function startTypewriter() {
  const el = $("typewriterText");
  if (!el) return;
  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;

  function tick() {
    const phrase = TYPE_PHRASES[phraseIndex];
    if (!deleting) {
      charIndex++;
      el.textContent = phrase.slice(0, charIndex);
      if (charIndex >= phrase.length) {
        deleting = true;
        setTimeout(tick, 2200);
        return;
      }
      setTimeout(tick, 55 + Math.random() * 40);
    } else {
      charIndex--;
      el.textContent = phrase.slice(0, charIndex);
      if (charIndex <= 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % TYPE_PHRASES.length;
        setTimeout(tick, 400);
        return;
      }
      setTimeout(tick, 28);
    }
  }
  tick();
}

function wireEvents() {
  initTheme();
  if ($("themeToggle")) $("themeToggle").onclick = toggleTheme;
  if ($("savedCount")) $("savedCount").textContent = saved.length;
  if ($("nameSearchBtn")) $("nameSearchBtn").onclick = () => searchByName(true);
  if ($("nameShuffleBtn")) $("nameShuffleBtn").onclick = async () => {
    if ($("nameSearchInput")) $("nameSearchInput").value = "";
    showToast("Shuffling recipes…");
    await loadRandomNameRecipes();
    showView("search");
  };
  if ($("nameResetBtn")) $("nameResetBtn").onclick = async () => {
    if ($("nameSearchInput")) $("nameSearchInput").value = "";
    nameResults = [];
    nameSearchPage = 0;
    nameSearchQuery = "";
    if ($("nameDietFilter")) $("nameDietFilter").value = "any";
    if ($("nameMealType")) $("nameMealType").value = "any";
    if ($("nameTime")) $("nameTime").value = "999";
    if ($("nameCalories")) $("nameCalories").value = "";
    if ($("nameProtein")) $("nameProtein").value = "";
    document.querySelectorAll(".namePref").forEach(p => p.checked = false);
    if ($("nameLoadMoreBtn")) $("nameLoadMoreBtn").hidden = true;
    showToast("Recipes search reset");
    await loadRandomNameRecipes();
  };
  if ($("nameLoadMoreBtn")) $("nameLoadMoreBtn").onclick = () => { if (nameSearchHasMore) searchByName(false); };
  if ($("toggleNameAdvancedBtn")) $("toggleNameAdvancedBtn").onclick = () => {
    const box = $("nameAdvancedFilters");
    if (!box) return;
    box.hidden = !box.hidden;
    $("toggleNameAdvancedBtn").textContent = box.hidden ? "Advanced filters ▾" : "Advanced filters ▴";
  };
  if ($("nameSearchInput")) $("nameSearchInput").addEventListener("keydown", e => { if (e.key === "Enter") searchByName(true); });
  // Filters always re-run (works with empty query → random catalog + filters)
  ["nameDietFilter","nameMealType","nameTime"].forEach(id => {
    if ($(id)) $(id).addEventListener("change", () => searchByName(true));
  });
  document.querySelectorAll(".namePref").forEach(c => {
    c.addEventListener("change", () => searchByName(true));
  });
  ["nameCalories","nameProtein"].forEach(id => {
    if ($(id)) $(id).addEventListener("change", () => searchByName(true));
  });


  // Search ingredients
  if ($("ingredientInput")) {
    $("ingredientInput").addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addIngredient($("ingredientInput").value.replace(",","").trim());
        $("ingredientInput").value = "";
      }
    });
  }
  if ($("addIngredientBtn")) $("addIngredientBtn").onclick = () => {
    addIngredient($("ingredientInput")?.value || "");
    if ($("ingredientInput")) $("ingredientInput").value = "";
  };
  // Popular chips toggle selection (color changes when selected)
  document.querySelectorAll(".suggest-chip[data-add], [data-add]").forEach(b => {
    b.addEventListener("click", () => toggleIngredient(b.dataset.add));
  });

  // Match mode toggles
  document.querySelectorAll('input[name="matchMode"]').forEach(r => {
    r.addEventListener("change", () => {
      matchMode = r.value;
      document.querySelectorAll(".toggle-pill").forEach(p => p.classList.toggle("active", p.querySelector("input")?.checked));
      rankAndRender();
    });
  });

  ["goal","calories","protein","time","mealType","servings","dietFilter"].forEach(id => {
    if ($(id)) $(id).addEventListener("change", () => {
      trackEvent("filter_used", { filter: id, value: $(id).value });
      searchRecipes(true);
    });
  });
  document.querySelectorAll(".pref").forEach(c => c.addEventListener("change", () => {
    const lab = c.closest(".quick-chip");
    if (lab) lab.classList.toggle("active", c.checked);
    rankAndRender();
  }));
  document.querySelectorAll(".namePref").forEach(c => c.addEventListener("change", () => {
    const lab = c.closest(".quick-chip");
    if (lab) lab.classList.toggle("active", c.checked);
  }));

  if ($("toggleAdvancedBtn")) $("toggleAdvancedBtn").onclick = () => {
    const box = $("advancedFilters");
    if (!box) return;
    box.hidden = !box.hidden;
    $("toggleAdvancedBtn").textContent = box.hidden ? "Advanced filters ▾" : "Advanced filters ▴";
  };
  if ($("toggleNameAdvancedBtn")) {
    // already wired above; ensure caret text
  }
  if ($("recipeBackBtn")) $("recipeBackBtn").onclick = () => goBackView();
  if ($("findBtn")) $("findBtn").onclick = () => { searchRecipes(true); showView("home"); };
  if ($("randomBtn")) $("randomBtn").onclick = async () => {
    // Shuffle: load a random catalog window, ignore previous ranking
    try {
      showToast("Shuffling recipes…");
      const page = Math.floor(Math.random() * 50);
      const from = page * 40;
      const to = from + 59;
      const { data, error } = await supabaseClient.from(TABLE_NAME).select("*").order("id", { ascending: true }).range(from, to);
      if (error) throw error;
      let batch = (data || []).map(convertRecipe);
      for (let i = batch.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [batch[i], batch[j]] = [batch[j], batch[i]];
      }
      batch.forEach(m => { if (!meals.some(x => String(x.id) === String(m.id))) meals.push(m); });
      rankedResults = batch.map(m => ({ ...m, score: Math.random() * 10, match: ingredientMatch(m) }));
      dataReady = true;
      renderMeals("mealGrid", rankedResults);
      if ($("resultsTitle")) $("resultsTitle").textContent = `${rankedResults.length} shuffled meals`;
      if ($("matchInfo")) $("matchInfo").textContent = "Random shuffle from the catalog — not tied to your ingredient list.";
      showView("home");
    } catch (err) {
      console.error(err);
      if (!rankedResults.length) return showToast("Search first");
      rankAndRender(true);
    }
  };
  if ($("resetBtn")) $("resetBtn").onclick = () => {
    selectedIngredients = [];
    renderChips(); renderHomeChips(); syncSuggestChips();
    ["calories","protein"].forEach(id => { if ($(id)) $(id).value = ""; });
    if ($("time")) $("time").value = "999";
    if ($("mealType")) $("mealType").value = "any";
    if ($("goal")) $("goal").value = "any";
    if ($("dietFilter")) $("dietFilter").value = "any";
    document.querySelectorAll(".pref").forEach(p => p.checked = false);
    searchRecipes(true);
  };
  if ($("loadMoreBtn")) $("loadMoreBtn").onclick = () => { if (hasMore && !isLoading) searchRecipes(false); };

  // Favorites opened via nav ♡ (data-nav="favorites")

  // Home wizard
  document.querySelectorAll("#homeIngredientChips .choice-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const ing = normalizeIngredient(btn.dataset.ing);
      if (selectedIngredients.includes(ing)) {
        selectedIngredients = selectedIngredients.filter(x => x !== ing);
      } else {
        selectedIngredients.push(ing);
      }
      renderChips(); renderHomeChips();
    });
  });
  if ($("homeIngredientInput")) {
    $("homeIngredientInput").addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        addIngredient($("homeIngredientInput").value);
        $("homeIngredientInput").value = "";
      }
    });
  }
  document.querySelectorAll("#homeGoals .goal-card").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#homeGoals .goal-card").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      homeGoal = btn.dataset.goal;
      if ($("goal")) $("goal").value = homeGoal;
    });
  });
  document.querySelectorAll("#homeHunger .choice-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#homeHunger .choice-chip").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      homeHunger = btn.dataset.hunger;
    });
  });
  if ($("homeFindBtn")) $("homeFindBtn").onclick = async () => {
    if ($("goal")) $("goal").value = homeGoal;
    // hunger → calorie hint
    if (homeHunger === "small" && $("calories")) $("calories").value = "400";
    if (homeHunger === "normal" && $("calories")) $("calories").value = "";
    if (homeHunger === "hungry" && $("calories")) $("calories").value = "650";
    matchMode = "flexible";
    const flex = document.querySelector('input[name="matchMode"][value="flexible"]');
    if (flex) flex.checked = true;
    showView("home");
    await searchRecipes(true);
  };

  if ($("generatePlanBtn")) $("generatePlanBtn").onclick = () => { generateWeeklyPlan(false); };
  if ($("useIngredientsPlanBtn")) $("useIngredientsPlanBtn").onclick = () => {
    if (!selectedIngredients.length) return showToast("Add ingredients on Home or Recipes first");
    generateWeeklyPlan(true);
  };
  if ($("buildShopBtn")) $("buildShopBtn").onclick = () => {
    const checked = [...document.querySelectorAll(".shop-day-filter:checked")].map(x => Number(x.value));
    buildShoppingList(checked.length ? checked : null);
  };
  if ($("shopModeDays")) $("shopModeDays").onclick = () => { shopViewMode = "days"; if (weeklyPlanData.length) { const checked = [...document.querySelectorAll(".shop-day-filter:checked")].map(x => Number(x.value)); buildShoppingList(checked.length ? checked : null); } };
  if ($("shopModeMerged")) $("shopModeMerged").onclick = () => { shopViewMode = "merged"; if (weeklyPlanData.length) { const checked = [...document.querySelectorAll(".shop-day-filter:checked")].map(x => Number(x.value)); buildShoppingList(checked.length ? checked : null); } };
  document.querySelectorAll(".shop-day-filter").forEach(cb => {
    cb.addEventListener("change", () => {
      const checked = [...document.querySelectorAll(".shop-day-filter:checked")].map(x => Number(x.value));
      if (weeklyPlanData.length) buildShoppingList(checked.length ? checked : null);
    });
  });
  if ($("clearShopBtn")) $("clearShopBtn").onclick = () => {
    shopItems = [];
    window._shopByDay = null;
    localStorage.setItem("wcieShop", "[]");
    renderShopList();
    if ($("usageSection")) $("usageSection").hidden = true;
    showToast("Grocery list cleared");
  };
  if ($("saveShopBtn")) $("saveShopBtn").onclick = () => saveGroceryList();
  if ($("savePlanBtn")) $("savePlanBtn").onclick = () => saveWeeklyPlan();
  if ($("loadPlanBtn")) $("loadPlanBtn").onclick = () => loadWeeklyPlan();
}

function routeFromLocation() {
  const path = location.pathname || "/";
  const recipeId = parseRecipePath(path);
  if (recipeId) {
    const tryOpen = () => {
      const meal = meals.find(m => String(m.id) === String(recipeId))
        || rankedResults.find(m => String(m.id) === String(recipeId));
      if (meal) { showRecipe(meal.id); return true; }
      return false;
    };
    if (!tryOpen()) {
      // fetch single recipe by id if possible
      (async () => {
        try {
          const { data, error } = await supabaseClient.from(TABLE_NAME).select("*").eq("id", recipeId).maybeSingle();
          if (!error && data) {
            const m = convertRecipe(data);
            if (!meals.some(x => String(x.id) === String(m.id))) meals.push(m);
            showRecipe(m.id);
          } else showView("search", { skipUrl: true });
        } catch { showView("home", { skipUrl: true }); }
      })();
    }
    return;
  }
  const norm = (path.replace(/\/$/, "") || "/");
  const view = PATH_TO_VIEW[norm] || PATH_TO_VIEW[path] || "home";
  showView(view, { skipUrl: true });
  if (VIEW_META[view]) setPageMeta(VIEW_META[view]);
  // Google sitelinks search box: /recipes?q=...
  try {
    const params = new URLSearchParams(location.search || "");
    const q = (params.get("q") || "").trim();
    if (q && (view === "search" || norm === "/recipes")) {
      if ($("nameSearchInput")) $("nameSearchInput").value = q;
      searchByName(true);
    }
  } catch (e) {}
}

document.addEventListener("DOMContentLoaded", () => {
  // Typewriter optional (hero simplified)
  if ($("typewriterText")) startTypewriter();
  wireEvents();
  renderChips();
  renderHomeChips();
  syncSuggestChips();
  loadGroceryList();
  window.addEventListener("popstate", () => routeFromLocation());
  // Auto-restore plan silently if present
  try {
    if (localStorage.getItem("wciePlan")) {
      // don't toast on auto-load
      const raw = localStorage.getItem("wciePlan");
      const payload = JSON.parse(raw);
      if (payload?.days?.length) {
        if (payload.dailyCal && $("plannerCalories")) $("plannerCalories").value = payload.dailyCal;
        if (payload.dailyP && $("plannerProtein")) $("plannerProtein").value = payload.dailyP;
        weeklyPlanData = payload.days.map(d => ({
          day: d.day,
          dayCal: d.dayCal || 0,
          dayP: d.dayP || 0,
          meals: (d.meals || []).map(slot => {
            const snap = slot.meal;
            if (!snap) return { type: slot.type, meal: null };
            let live = { ...snap };
            if (!meals.some(m => String(m.id) === String(live.id))) meals.push(live);
            return { type: slot.type || "dinner", meal: live };
          })
        }));
        renderWeeklyPlanFromData();
      }
    }
  } catch (e) { console.error(e); }
  if (!shopItems.length && !window._shopByDay) renderShopList();
  routeFromLocation();
  searchRecipes(true);
});
