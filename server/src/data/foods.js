// APPROXIMATE per-serving values for demonstration. Verify against IFCT / USDA before any production use.
// diet: v=vegan, g=vegetarian(dairy ok), e=eggetarian, n=non-veg. A food is allowed if its level <= member's level.
// allergens use canonical keys: gluten, dairy, egg, peanut, tree_nut, soy, fish, shellfish, sesame
const f = (id, name, serving, kcal, p, c, fat, role, meals, level, allergens = []) =>
  ({ id, name, serving, kcal, proteinG: p, carbsG: c, fatG: fat, role, meals, level, allergens });
const B = ['breakfast'], L = ['lunch', 'dinner'], S = ['snack'], A = ['breakfast', 'lunch', 'dinner'];

export const FOODS = [
  // carbs
  f('poha', 'Vegetable poha', '1 cup', 250, 5, 45, 6, 'carb', B, 'v'),
  f('idli', 'Idli', '2 pieces', 140, 4, 30, 0.5, 'carb', B, 'v'),
  f('dosa', 'Plain dosa', '1 piece', 135, 3, 22, 3.5, 'carb', B, 'v'),
  f('upma', 'Vegetable upma', '1 cup', 230, 5, 35, 8, 'carb', B, 'v', ['gluten']),
  f('oats', 'Oats porridge (in water)', '1 bowl (40 g oats)', 150, 5, 27, 3, 'carb', B, 'v', ['gluten']),
  f('bread', 'Whole-wheat bread', '2 slices', 160, 7, 28, 2, 'carb', B, 'v', ['gluten']),
  f('roti', 'Whole-wheat roti', '1 medium', 100, 3, 18, 2, 'carb', L, 'v', ['gluten']),
  f('rice', 'Steamed rice', '1 cup cooked', 205, 4, 45, 0.4, 'carb', L, 'v'),
  f('brownrice', 'Brown rice', '1 cup cooked', 215, 5, 45, 1.8, 'carb', L, 'v'),
  f('khichdi', 'Moong dal khichdi', '1 cup', 210, 8, 36, 3, 'carb', L, 'v'),
  f('sweetpotato', 'Boiled sweet potato', '150 g', 130, 2, 30, 0.2, 'carb', L, 'v'),
  // proteins
  f('egg', 'Boiled egg', '1 large', 78, 6.3, 0.6, 5.3, 'protein', A, 'e', ['egg']),
  f('bhurji', 'Egg bhurji (2 eggs)', '1 serving', 200, 13, 2, 15, 'protein', B, 'e', ['egg']),
  f('chickenbreast', 'Grilled chicken breast', '100 g cooked', 165, 31, 0, 3.6, 'protein', L, 'n'),
  f('chickencurry', 'Home-style chicken curry', '1 bowl (150 g)', 250, 24, 6, 14, 'protein', L, 'n'),
  f('fish', 'Grilled fish', '100 g', 140, 20, 0, 6, 'protein', L, 'n', ['fish']),
  f('paneer', 'Paneer', '50 g', 133, 9, 1.5, 10, 'protein', A, 'g', ['dairy']),
  f('curd', 'Curd (dahi)', '1 cup (200 g)', 120, 7, 9, 6, 'protein', A, 'g', ['dairy']),
  f('moongdal', 'Moong dal', '1 cup cooked', 210, 14, 38, 0.8, 'protein', L, 'v'),
  f('toordal', 'Toor dal', '1 cup cooked', 200, 12, 35, 1, 'protein', L, 'v'),
  f('chana', 'Boiled chickpeas (chana)', '1 cup', 270, 14.5, 45, 4.2, 'protein', A, 'v'),
  f('rajma', 'Rajma', '1 cup cooked', 225, 15, 40, 0.9, 'protein', L, 'v'),
  f('tofu', 'Tofu', '100 g', 80, 9, 2, 4.8, 'protein', L, 'v', ['soy']),
  f('soya', 'Soya chunks (dry weight)', '30 g', 104, 15.6, 10, 0.2, 'protein', L, 'v', ['soy']),
  f('sprouts', 'Moong sprouts salad', '1 cup', 60, 5, 10, 0.4, 'protein', B, 'v'),
  // veg + sides
  f('sabzi', 'Mixed vegetable sabzi', '1 cup', 100, 3, 12, 5, 'veg', L, 'v'),
  f('palak', 'Spinach (palak) sabzi', '1 cup', 90, 4, 8, 5, 'veg', L, 'v'),
  f('salad', 'Cucumber-tomato-carrot salad', '1 bowl', 40, 1.5, 8, 0.3, 'side', L, 'v'),
  f('buttermilk', 'Buttermilk (chaas)', '1 glass', 40, 2, 5, 1, 'side', L, 'g', ['dairy']),
  // fruit
  f('banana', 'Banana', '1 medium', 105, 1.3, 27, 0.4, 'fruit', ['breakfast', 'snack'], 'v'),
  f('apple', 'Apple', '1 medium', 95, 0.5, 25, 0.3, 'fruit', ['breakfast', 'snack'], 'v'),
  f('papaya', 'Papaya', '1 cup', 60, 1, 15, 0.4, 'fruit', ['breakfast', 'snack'], 'v'),
  f('orange', 'Orange', '1 medium', 62, 1.2, 15, 0.2, 'fruit', ['breakfast', 'snack'], 'v'),
  // snacks
  f('roastedchana', 'Roasted chana', '30 g', 110, 6, 18, 1.8, 'snack', S, 'v'),
  f('makhana', 'Roasted makhana', '30 g', 104, 2.9, 23, 0.1, 'snack', S, 'v'),
  f('almonds', 'Almonds', '20 g (~14)', 115, 4.2, 4.3, 10, 'snack', S, 'v', ['tree_nut']),
  f('peanuts', 'Roasted peanuts', '30 g', 170, 7.7, 5, 14.5, 'snack', S, 'v', ['peanut']),
  f('sattu', 'Sattu drink', '1 glass (30 g sattu)', 110, 6, 18, 1.5, 'snack', S, 'v'),
  f('milk', 'Toned milk', '1 glass (250 ml)', 150, 8, 12, 5.5, 'drink', S, 'g', ['dairy']),
  f('eggsnack', 'Boiled egg (snack)', '1 large', 78, 6.3, 0.6, 5.3, 'snack', S, 'e', ['egg']),
];
