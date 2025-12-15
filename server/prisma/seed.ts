import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: 'メール/チャット', priority: 1 },
  { name: '実装/検証',       priority: 2 },
  { name: '会議',             priority: 3 },
  { name: '資料作成',         priority: 4 },
  { name: '商談/外出',       priority: 5 },
  { name: '電話対応',         priority: 6 },
  { name: '事務処理',         priority: 7 },
  { name: '休憩',             priority: 8 },
  { name: '離席/移動',       priority: 9 },
];

async function main() {
  // Admin User
  const admin = await prisma.user.upsert({
    where: { uid: 'admin' },
    update: {
      role: 'ADMIN', // Ensure role is updated to ADMIN
      name: 'Administrator', // Ensure name is correct
    },
    create: {
      uid: 'admin',
      name: 'Administrator',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log({ admin });

  // Categories (冪等性を考慮してupsert等は難しいので、既存チェックなしでcreateする簡易実装とするか、一旦削除するか)
  // ここではシンプルに作成する。重複エラーが出る場合は別途対応。
  // 開発環境なので一旦全削除してから作るのがきれい。
  
  await prisma.workLog.deleteMany();
  await prisma.category.deleteMany();
  
  for (const cat of CATEGORIES) {
    await prisma.category.create({
      data: {
        name: cat.name,
        type: 'SYSTEM',
        createdById: admin.id,
        priority: cat.priority,
      },
    });
  }

  // Fetch created categories to use their IDs
  const categories = await prisma.category.findMany();
  
  // Create sample logs for yesterday to ensure they are in the past and valid
  console.log('Creating sample logs...');
  const now = new Date();
  // Set to yesterday 9:00 AM
  const startTime = new Date(now);
  startTime.setDate(startTime.getDate() - 1);
  startTime.setHours(9, 0, 0, 0);
  
  // Helper to find category
  const getCat = (name: string) => categories.find(c => c.name === name);

  const samples = [
    { cat: 'メール/チャット', durationMin: 30 },
    { cat: '会議',             durationMin: 60 },
    { cat: '実装/検証',       durationMin: 120 },
    { cat: '休憩',             durationMin: 60 },
    { cat: '実装/検証',       durationMin: 90 },
  ];

  let currentTime = startTime;

  for (const sample of samples) {
    const cat = getCat(sample.cat);
    if (cat) {
      const endTime = new Date(currentTime.getTime() + sample.durationMin * 60 * 1000);
      const duration = Math.floor((endTime.getTime() - currentTime.getTime()) / 1000);
      
      await prisma.workLog.create({
        data: {
          userId: admin.id,
          categoryId: cat.id,
          categoryNameSnapshot: cat.name,
          startTime: currentTime,
          endTime: endTime,
          duration: duration,
        },
      });
      
      currentTime = endTime;
    }
  }
  
  console.log('Seed data inserted');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
