import { Router, Request, Response } from 'express';
import { prisma } from './db';

const router = Router();

// --- Log Operations ---

// GET /api/logs/active/:uid
// 現在計測中のタスクを取得
router.get('/logs/active/:uid', async (req: Request, res: Response) => {
  const { uid } = req.params;
  try {
    // First find the user by uid
    const user = await prisma.user.findUnique({
      where: { uid },
    });

    if (!user) {
      res.json(null);
      return;
    }

    const activeLog = await prisma.workLog.findFirst({
      where: {
        userId: user.id,
        endTime: null,
      },
    });
    res.json(activeLog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch active log' });
  }
});

// POST /api/logs/switch
// 作業切り替え
router.post('/logs/switch', async (req: Request, res: Response) => {
  const { uid, categoryId, categoryLabel, role } = req.body;
  
  if (!uid || !categoryId || !categoryLabel) {
    res.status(400).json({ error: 'Missing required fields' });
    return; // Ensure to return to stop execution
  }

  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // First find the user by uid
      const user = await tx.user.findUnique({
        where: { uid },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // 1. Close active log
      const activeLog = await tx.workLog.findFirst({
        where: {
          userId: user.id,
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
          userId: user.id,
          categoryId,
          categoryNameSnapshot: categoryLabel,
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

// POST /api/logs/stop
// 作業停止
router.post('/logs/stop', async (req: Request, res: Response) => {
  const { uid } = req.body;
  
  if (!uid) {
    res.status(400).json({ error: 'UID is required' });
    return;
  }

  const now = new Date();

  try {
    // First find the user by uid
    const user = await prisma.user.findUnique({
      where: { uid },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const activeLog = await prisma.workLog.findFirst({
      where: {
        userId: user.id,
        endTime: null,
      },
    });

    if (!activeLog) {
      res.status(404).json({ error: 'No active log found' });
      return;
    }

    const duration = Math.floor((now.getTime() - activeLog.startTime.getTime()) / 1000);
    
    const updatedLog = await prisma.workLog.update({
      where: { id: activeLog.id },
      data: {
        endTime: now,
        duration,
      },
    });

    res.json(updatedLog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to stop task' });
  }
});

// PATCH /api/logs/:id
// ログ修正
router.patch('/logs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { categoryId, categoryLabel } = req.body;

  try {
    const updatedLog = await prisma.workLog.update({
      where: { id: parseInt(id) },
      data: {
        categoryId,
        categoryLabel,
      },
    });
    res.json(updatedLog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update log' });
  }
});

// DELETE /api/logs/:id
// ログ削除
router.delete('/logs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await prisma.workLog.delete({
      where: { id: parseInt(id) },
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

// GET /api/logs/history/:uid
// 当日の履歴
router.get('/logs/history/:uid', async (req: Request, res: Response) => {
  const { uid } = req.params;
  
  // Get start of today (00:00:00)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // First find the user by uid
    const user = await prisma.user.findUnique({
      where: { uid },
    });

    if (!user) {
      res.json([]);
      return;
    }

    const logs = await prisma.workLog.findMany({
      where: {
        userId: user.id,
        startTime: {
          gte: today,
        },
      },
      orderBy: {
        startTime: 'desc',
      },
    });
    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/export/csv
// 全データのCSVエクスポート
router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    const logs = await prisma.workLog.findMany({
      orderBy: { startTime: 'desc' },
    });

    // Simple CSV conversion
    const headers = ['id', 'userId', 'categoryId', 'categoryNameSnapshot', 'startTime', 'endTime', 'duration', 'createdAt'];
    const csvRows = [headers.join(',')];

    for (const log of logs) {
      csvRows.push([
        log.id,
        `"${log.userId}"`,
        `"${log.categoryId}"`,
        `"${log.categoryNameSnapshot}"`,
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

// GET /api/settings/:uid
router.get('/settings/:uid', async (req: Request, res: Response) => {
  const { uid } = req.params;
  try {
    const settings = await prisma.userSetting.findUnique({
      where: { uid },
    });
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/settings
router.post('/settings', async (req: Request, res: Response) => {
  let { uid, primaryButtons, secondaryButtons, customCategories } = req.body;
  
  if (!uid) {
    res.status(400).json({ error: 'UID is required' });
    return;
  }

  // Ensure customCategories is properly formatted
  if (typeof customCategories === 'string') {
    try {
      customCategories = JSON.parse(customCategories);
    } catch (e) {
      console.error('Failed to parse customCategories string:', e);
      customCategories = [];
    }
  }

  if (!Array.isArray(customCategories)) {
    customCategories = [];
  }

  try {
    const settings = await prisma.userSetting.upsert({
      where: { uid },
      update: {
        primaryButtons,
        secondaryButtons,
        customCategories,
      },
      create: {
        uid,
        primaryButtons,
        secondaryButtons,
        customCategories,
      },
    });
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

export default router;
