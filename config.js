// הגדרות שאפשר לשנות. כל שינוי כאן מחייב להעלות את VERSION ב-sw.js.
export const CONFIG = {
  // ערכי X ברירת מחדל, בס״מ. '' = אין ברירת מחדל (מגדירים בתוך האפליקציה).
  xDefaults: {
    'single.h': '2.8',
    'single.w': '3.8',
    'double.h': '2.8',
    'double.w': '4.8',
    'triple.h': '',
    'triple.w': '',
    'cornice': '3.9',
  },
  // סדר הכפתורים במסך הפתיחה
  homeOrder: ['single', 'double', 'triple', 'handles', 'cornice'],
  // מגבלות הקלדה: ספרות לפני הנקודה / אחרי הנקודה
  maxInt: 4,
  maxDec: 1,
  // X גדול מזה נדחה (כנראה הוקלדה מידה במקום X)
  xMax: '30',
  // הכתובת הקבועה של האתר (לשיתוף)
  appUrl: 'https://mamosnoam.github.io/kitchen-calc/',
};
