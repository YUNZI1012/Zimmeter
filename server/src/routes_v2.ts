import { Router, Request, Response } from 'express';
import { prisma } from './db';
import { UserStatus, Role, CategoryType } from '@prisma/client';

console.log('Loading routes_v2...');

const router = Router();

// --- Helper: Get User from Request ---
// statusGuardでセットされたユーザーを使用
const getUser = (req: Request) => {
  if (!req.user) throw new Error('User not found in request');
  return req.user;
};

// --- User Management (Admin Only) ---

// GET /api/users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    if (currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/me (Polling用)
router.get('/users/me', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    res.json(currentUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// PUT /api/users/:id
router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    if (currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { id } = req.params;
    const { name, role, hourlyRate } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: Number(id) },
      data: { name, role, hourlyRate },
    });
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// PATCH /api/users/:id/status
router.patch('/users/:id/status', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    if (currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { id } = req.params;
    const { status } = req.body; // Active, Disabled, Deleted

    const updatedUser = await prisma.user.update({
      where: { id: Number(id) },
      data: { status },
    });
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// --- Category Management ---

// GET /api/categories
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    
    // SYSTEMカテゴリ + 自分のCUSTOMカテゴリ
    const categories = await prisma.category.findMany({
      where: {
        OR: [
          { type: 'SYSTEM' },
          { type: 'CUSTOM', createdById: currentUser.id },
        ],
        isDeleted: false,
      },
      orderBy: { priority: 'asc' },
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const { name, type, priority, defaultList, bgColor, borderColor } = req.body;

    // Admin以外がSYSTEMを作成しようとしたらエラー
    if (type === 'SYSTEM' && currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admin can create SYSTEM categories' });
    }

    const category = await prisma.category.create({
      data: {
        name,
        type: type || 'CUSTOM',
        createdById: currentUser.id, // SYSTEMでも作成者として残す
        priority: priority || 0,
        defaultList: defaultList || 'SECONDARY',
        bgColor,
        borderColor,
      },
    });
    res.json(category);
  } catch (error: any) {
    console.error('[Create Category Error]:', error);
    res.status(500).json({ error: 'Failed to create category', details: error.message });
  }
});

// PUT /api/categories/reorder
router.put('/categories/reorder', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const { orders } = req.body; // { id: number, priority: number }[]

    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    // トランザクションで一括更新
    await prisma.$transaction(
      orders.map((item: any) => {
        const data: any = { priority: item.priority };
        if (item.defaultList) {
          data.defaultList = item.defaultList;
        }
        return prisma.category.update({
          where: { id: item.id },
          data,
        });
      })
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder Error:', error);
    res.status(500).json({ error: 'Failed to reorder categories' });
  }
});

// PUT /api/categories/:id
router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const { id } = req.params;
    const { name, priority, defaultList, bgColor, borderColor } = req.body;

    const category = await prisma.category.findUnique({ where: { id: Number(id) } });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    // 権限チェック
    if (category.type === 'SYSTEM' && currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }
    if (category.type === 'CUSTOM' && category.createdById !== currentUser.id) {
      return res.status(403).json({ error: 'Owner only' });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (priority !== undefined) data.priority = priority;
    if (defaultList !== undefined) data.defaultList = defaultList;
    if (bgColor !== undefined) data.bgColor = bgColor;
    if (borderColor !== undefined) data.borderColor = borderColor;

    const updated = await prisma.category.update({
      where: { id: Number(id) },
      data,
    });
    res.json(updated);
  } catch (error) {
    console.error('[Update Category Error]:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const { id } = req.params;

    const category = await prisma.category.findUnique({ where: { id: Number(id) } });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    // 権限チェック
    if (category.type === 'SYSTEM' && currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }
    if (category.type === 'CUSTOM' && category.createdById !== currentUser.id) {
      return res.status(403).json({ error: 'Owner only' });
    }

    const updated = await prisma.category.update({
      where: { id: Number(id) },
      data: { isDeleted: true }, // 論理削除
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});


// --- Log Operations ---

// GET /api/logs/active
// 現在計測中のタスクを取得
router.get('/logs/active', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const activeLog = await prisma.workLog.findFirst({
      where: {
        userId: currentUser.id,
        endTime: null,
      },
      include: { category: true }, // カテゴリ情報も取得
    });
    res.json(activeLog);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch active log' });
  }
});

// POST /api/logs/switch
// 作業切り替え
router.post('/logs/switch', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const { categoryId } = req.body; // Int
  
    if (!categoryId) {
      return res.status(400).json({ error: 'Missing categoryId' });
    }

    const now = new Date();

    // カテゴリ情報の取得 (スナップショット用)
    const category = await prisma.category.findUnique({
      where: { id: Number(categoryId) },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Close active log
      const activeLog = await tx.workLog.findFirst({
        where: {
          userId: currentUser.id,
          endTime: null,
        },
      });

      if (activeLog) {
        const duration = Math.floor((now.getTime() - activeLog.startTime.getTime()) / 1000);
        await tx.workLog.update({
          where: { id: activeLog.id },
          data: {
            endTime: now,
            duration,
          },
        });
      }

      // 2. Create new log
      const newLog = await tx.workLog.create({
        data: {
          userId: currentUser.id,
          categoryId: Number(categoryId),
          categoryNameSnapshot: category.name, // ★スナップショット保存
          startTime: now,
        },
      });

      return newLog;
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to switch task' });
  }
});

// PATCH /api/logs/:id
// ログ修正
router.patch('/logs/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const { id } = req.params;
    const { categoryId } = req.body;

    const log = await prisma.workLog.findUnique({ where: { id: Number(id) } });
    if (!log) return res.status(404).json({ error: 'Log not found' });

    // 権限チェック (Admin or Owner)
    if (log.userId !== currentUser.id && currentUser.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    // カテゴリ情報の取得 (スナップショット更新用)
    const category = await prisma.category.findUnique({
      where: { id: Number(categoryId) },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const updatedLog = await prisma.workLog.update({
      where: { id: Number(id) },
      data: {
        categoryId: Number(categoryId),
        categoryNameSnapshot: category.name,
      },
    });

    res.json(updatedLog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update log' });
  }
});

// DELETE /api/logs/:id
router.delete('/logs/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const { id } = req.params;

    const log = await prisma.workLog.findUnique({ where: { id: Number(id) } });
    if (!log) return res.status(404).json({ error: 'Log not found' });
    
    // 他人のログは削除不可 (Adminなら削除可能にするなら要件確認だが、基本は本人)
    if (log.userId !== currentUser.id && currentUser.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.workLog.delete({
      where: { id: Number(id) },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

// GET /api/logs/history
// 当日の履歴
router.get('/logs/history', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    
    // Get start of today (00:00:00)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await prisma.workLog.findMany({
      where: {
        userId: currentUser.id,
        startTime: {
          gte: today,
        },
      },
      orderBy: {
        startTime: 'desc',
      },
      include: { category: true }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/logs/monitor (Admin Only)
router.get('/logs/monitor', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    if (currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }

    // 直近24時間のログ
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const logs = await prisma.workLog.findMany({
      where: {
        createdAt: {
          gte: oneDayAgo,
        }
      },
      orderBy: { startTime: 'desc' },
      include: { user: true, category: true },
      take: 100 // 重くなりすぎないよう制限
    });
    res.json(logs);

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch monitor logs' });
  }
});

// GET /api/logs/stats (Admin Only)
// 特定ユーザーの直近日/週/月ごとの集計とカテゴリ別割合を返す
router.get('/logs/stats', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    if (currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { userId, mode } = req.query;

    if (!userId || !mode) {
      return res.status(400).json({ error: 'Missing userId or mode' });
    }

    const modeStr = String(mode);
    if (!['day', 'week', 'month'].includes(modeStr)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const now = new Date();
    let rangeStart = new Date(now);
    let bucketCount = 0;

    if (modeStr === 'day') {
      // 直近30日
      rangeStart.setDate(rangeStart.getDate() - 29);
      rangeStart.setHours(0, 0, 0, 0);
      bucketCount = 30;
    } else if (modeStr === 'week') {
      // 直近12週（現在の週を含む）
      // 週の開始を月曜とみなす
      const day = rangeStart.getDay();
      const diffToMonday = (day + 6) % 7; // 0:日 -> 6, 1:月 -> 0 ...
      rangeStart.setDate(rangeStart.getDate() - diffToMonday);
      rangeStart.setHours(0, 0, 0, 0);
      rangeStart.setDate(rangeStart.getDate() - 7 * 11);
      bucketCount = 12;
    } else {
      // month: 直近12ヶ月（今月を含む）
      rangeStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 11, 1, 0, 0, 0, 0);
      bucketCount = 12;
    }

    // 対象ユーザーのログを取得
    const logs = await prisma.workLog.findMany({
      where: {
        userId: Number(userId),
        startTime: {
          gte: rangeStart,
          lte: now,
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // バケット初期化
    type Bucket = { label: string; totalSeconds: number };
    const buckets: Bucket[] = [];

    if (modeStr === 'day') {
      for (let i = 0; i < bucketCount; i++) {
        const d = new Date(rangeStart);
        d.setDate(rangeStart.getDate() + i);
        const label = d.toISOString().slice(0, 10); // YYYY-MM-DD
        buckets.push({ label, totalSeconds: 0 });
      }
    } else if (modeStr === 'week') {
      for (let i = 0; i < bucketCount; i++) {
        const d = new Date(rangeStart);
        d.setDate(rangeStart.getDate() + i * 7);
        const year = d.getFullYear();
        const weekIndex = i + 1; // 直近12週の中でのインデックス
        const label = `${year}-W${String(weekIndex).padStart(2, '0')}`;
        buckets.push({ label, totalSeconds: 0 });
      }
    } else {
      for (let i = 0; i < bucketCount; i++) {
        const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
        const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        buckets.push({ label, totalSeconds: 0 });
      }
    }

    const byCategory: Record<string, number> = {};

    for (const log of logs) {
      const start = log.startTime;
      const durationSec = log.duration ?? (log.endTime ? Math.floor((log.endTime.getTime() - log.startTime.getTime()) / 1000) : 0);
      if (!durationSec) continue;

      let bucketIndex = -1;

      if (modeStr === 'day') {
        const diffDays = Math.floor((start.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < bucketCount) {
          bucketIndex = diffDays;
        }
      } else if (modeStr === 'week') {
        const diffDays = Math.floor((start.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.floor(diffDays / 7);
        if (diffWeeks >= 0 && diffWeeks < bucketCount) {
          bucketIndex = diffWeeks;
        }
      } else {
        const year = start.getFullYear();
        const month = start.getMonth();
        const startYear = rangeStart.getFullYear();
        const startMonth = rangeStart.getMonth();
        const diffMonths = (year - startYear) * 12 + (month - startMonth);
        if (diffMonths >= 0 && diffMonths < bucketCount) {
          bucketIndex = diffMonths;
        }
      }

      if (bucketIndex >= 0) {
        buckets[bucketIndex].totalSeconds += durationSec;
      }

      const catName = log.categoryNameSnapshot || 'Unknown';
      byCategory[catName] = (byCategory[catName] || 0) + durationSec;
    }

    const timeSeries = buckets.map((b) => ({
      label: b.label,
      totalMinutes: Math.round(b.totalSeconds / 60),
    }));

    const byCategoryArr = Object.entries(byCategory).map(([categoryName, totalSeconds]) => ({
      categoryName,
      minutes: Math.round(totalSeconds / 60),
    }));

    res.json({ timeSeries, byCategory: byCategoryArr });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});


// GET /api/export/csv
// 全データのCSVエクスポート
router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    // Adminは全データ、Userは自分のみ
    // 現状は簡易的に全員全データアクセスできる仕様だったが、要件に合わせて制限すべき。
    // 「CSVダウンロード機能」要件には「入力: 対象期間, ユーザーID」とある。
    // ここではQuery Paramsで対応する。

    const currentUser = getUser(req);
    const { start, end, targetUid } = req.query;

    const where: any = {};
    
    // 一般ユーザーは自分のログしか見れない
    if (currentUser.role !== 'ADMIN') {
      where.userId = currentUser.id;
    } else if (targetUid) {
      // Adminが特定ユーザーを指定した場合
      const target = await prisma.user.findUnique({ where: { uid: String(targetUid) } });
      if (target) where.userId = target.id;
    }

    if (start || end) {
      where.startTime = {};
      if (start) where.startTime.gte = new Date(String(start));
      if (end) where.startTime.lte = new Date(String(end));
    }

    const logs = await prisma.workLog.findMany({
      where,
      orderBy: { startTime: 'desc' },
      include: { user: true },
    });

    const headers = ['id', 'uid', 'name', 'categoryName', 'startTime', 'endTime', 'duration', 'createdAt'];
    const csvRows = [headers.join(',')];

    for (const log of logs) {
      csvRows.push([
        log.id,
        `"${log.user.uid}"`,
        `"${log.user.name}"`,
        `"${log.categoryNameSnapshot}"`, // ★スナップショット使用
        log.startTime.toISOString(),
        log.endTime ? log.endTime.toISOString() : '',
        log.duration || '',
        log.createdAt.toISOString()
      ].join(','));
    }

    res.header('Content-Type', 'text/csv');
    res.attachment('work_logs.csv');
    res.send(csvRows.join('\n'));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});


// --- Settings Operations ---

// GET /api/settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const settings = await prisma.userSetting.findUnique({
      where: { userId: currentUser.id },
    });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/settings
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const { preferences } = req.body;
  
    const settings = await prisma.userSetting.upsert({
      where: { userId: currentUser.id },
      update: {
        preferences,
      },
      create: {
        userId: currentUser.id,
        preferences,
      },
    });
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// DELETE /api/settings
// 設定リセット
router.delete('/settings', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    await prisma.userSetting.deleteMany({
      where: { userId: currentUser.id },
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset settings' });
  }
});

console.log('Routes defined in v2:', router.stack.length);

export default router;
