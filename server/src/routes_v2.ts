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
    const { name, type, priority } = req.body;

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
      },
    });
    res.json(category);
  } catch (error: any) {
    console.error('[Create Category Error]:', error);
    res.status(500).json({ error: 'Failed to create category', details: error.message });
  }
});

// PUT /api/categories/:id
router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);
    const { id } = req.params;
    const { name } = req.body;

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
      data: { name }, // 名前のみ更新
    });
    res.json(updated);
  } catch (error) {
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

console.log('Routes defined in v2:', router.stack.length);

export default router;
