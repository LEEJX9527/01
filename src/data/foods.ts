// 常见食物营养数据（每 100g 可食部分），参考《中国食物成分表》近似值
export interface FoodRef {
  name: string
  aliases?: string[]
  kcal: number
  protein: number
  fat: number
  carbs: number
  /** 默认一份的克数，用于“一碗”“一个”等无重量描述 */
  serving: number
}

export const FOODS: FoodRef[] = [
  { name: '米饭', aliases: ['白米饭', '大米饭'], kcal: 116, protein: 2.6, fat: 0.3, carbs: 25.9, serving: 150 },
  { name: '馒头', kcal: 223, protein: 7, fat: 1.1, carbs: 47, serving: 100 },
  { name: '面条', aliases: ['煮面条'], kcal: 110, protein: 3.9, fat: 0.4, carbs: 22.8, serving: 200 },
  { name: '全麦面包', aliases: ['面包'], kcal: 246, protein: 13, fat: 3.4, carbs: 41, serving: 50 },
  { name: '燕麦', aliases: ['燕麦片'], kcal: 367, protein: 12.2, fat: 6.7, carbs: 61.6, serving: 40 },
  { name: '玉米', kcal: 112, protein: 4, fat: 1.2, carbs: 22.8, serving: 200 },
  { name: '红薯', aliases: ['地瓜'], kcal: 86, protein: 1.6, fat: 0.1, carbs: 20.1, serving: 200 },
  { name: '土豆', aliases: ['马铃薯'], kcal: 77, protein: 2, fat: 0.2, carbs: 17.2, serving: 150 },
  { name: '鸡蛋', aliases: ['水煮蛋', '煮鸡蛋'], kcal: 144, protein: 13.3, fat: 8.8, carbs: 2.8, serving: 50 },
  { name: '鸡胸肉', kcal: 133, protein: 24.6, fat: 1.9, carbs: 2.5, serving: 150 },
  { name: '猪肉', aliases: ['瘦猪肉'], kcal: 143, protein: 20.3, fat: 6.2, carbs: 1.5, serving: 100 },
  { name: '牛肉', aliases: ['瘦牛肉'], kcal: 106, protein: 20.2, fat: 2.3, carbs: 1.2, serving: 100 },
  { name: '三文鱼', kcal: 139, protein: 17.2, fat: 7.8, carbs: 0, serving: 100 },
  { name: '虾', aliases: ['虾仁'], kcal: 93, protein: 18.6, fat: 0.8, carbs: 2.8, serving: 100 },
  { name: '豆腐', kcal: 82, protein: 8.1, fat: 3.7, carbs: 4.2, serving: 150 },
  { name: '牛奶', aliases: ['纯牛奶'], kcal: 54, protein: 3, fat: 3.2, carbs: 3.4, serving: 250 },
  { name: '酸奶', kcal: 72, protein: 2.5, fat: 2.7, carbs: 9.3, serving: 200 },
  { name: '豆浆', kcal: 31, protein: 3, fat: 1.6, carbs: 1.2, serving: 250 },
  { name: '苹果', kcal: 53, protein: 0.4, fat: 0.2, carbs: 13.7, serving: 200 },
  { name: '香蕉', kcal: 93, protein: 1.4, fat: 0.2, carbs: 22, serving: 120 },
  { name: '橙子', kcal: 48, protein: 0.8, fat: 0.2, carbs: 11.1, serving: 200 },
  { name: '西兰花', kcal: 36, protein: 4.1, fat: 0.6, carbs: 4.3, serving: 150 },
  { name: '西红柿', aliases: ['番茄'], kcal: 20, protein: 0.9, fat: 0.2, carbs: 4, serving: 150 },
  { name: '黄瓜', kcal: 16, protein: 0.8, fat: 0.2, carbs: 2.9, serving: 150 },
  { name: '青菜', aliases: ['小白菜', '油菜'], kcal: 15, protein: 1.5, fat: 0.3, carbs: 2.7, serving: 200 },
  { name: '花生', kcal: 574, protein: 24.8, fat: 44.3, carbs: 21.7, serving: 30 },
  { name: '核桃', kcal: 646, protein: 14.9, fat: 58.8, carbs: 19.1, serving: 30 },
  { name: '可乐', kcal: 43, protein: 0, fat: 0, carbs: 10.8, serving: 330 },
  { name: '薯片', kcal: 548, protein: 5.7, fat: 34.3, carbs: 54.9, serving: 50 },
  { name: '巧克力', kcal: 589, protein: 4.3, fat: 40.1, carbs: 53.4, serving: 30 },
]
