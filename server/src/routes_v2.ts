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

// POST /api/logs/manual
// 履歴を手動追加（startTimeのみ。当日の最後の履歴のstartTimeをendTimeとしてdurationを計算）
router.post('/logs/manual', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Missing user context (x-user-id header or uid query param)' });
    }
    const currentUser = req.user;
    const { categoryId, startTime } = req.body;

    if (!categoryId || !startTime) {
      return res.status(400).json({ error: 'Missing categoryId/startTime' });
    }

    const start = new Date(startTime);
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid startTime' });
    }

    // 当日の最後の履歴を取得して、その startTime を endTime とする
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastLog = await prisma.workLog.findFirst({
      where: {
        userId: currentUser.id,
        startTime: { gte: today },
      },
      orderBy: { startTime: 'desc' },
    });

    const now = new Date();
    if (now.getTime() <= start.getTime()) {
      return res.status(400).json({ error: 'startTime must be before current time' });
    }

    // Set endTime same as startTime for manual logs to mark them as closed.
    // The actual duration/endTime displayed in history is recalculated dynamically based on the next log.
    // This prevents "active" log detection issues (endTime: null) and invalid durations.
    const end = start; 
    const duration = 0;

    const category = await prisma.category.findUnique({
      where: { id: Number(categoryId) },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const created = await prisma.workLog.create({
      data: {
        userId: currentUser.id,
        categoryId: Number(categoryId),
        categoryNameSnapshot: category.name,
        startTime: start,
        endTime: end,
        duration,
        isManual: true, // 手動作成
      },
    });

    res.json(created);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create log' });
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

    // Check if trying to remove ADMIN role
    if (role === 'USER') {
      const userToUpdate = await prisma.user.findUnique({
        where: { id: Number(id) },
      });

      if (userToUpdate?.role === 'ADMIN') {
        const adminCount = await prisma.user.count({
          where: {
            role: 'ADMIN',
            status: { not: 'DELETED' }
          }
        });

        if (adminCount <= 1) {
          return res.status(400).json({ 
            error: 'Cannot remove last admin', 
            message: 'システムには最低1人の管理者が必要です。' 
          });
        }
      }
    }

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

    // Check if trying to disable/delete an ADMIN
    if (status === 'DISABLED' || status === 'DELETED') {
      const userToUpdate = await prisma.user.findUnique({
        where: { id: Number(id) },
      });

      if (userToUpdate?.role === 'ADMIN') {
        const adminCount = await prisma.user.count({
          where: {
            role: 'ADMIN',
            status: { not: 'DELETED' } // Count active/disabled admins (though disabling last active is also bad, let's stick to active)
            // Actually, if we disable, we should check for ACTIVE admins.
            // If we delete, we check for not DELETED.
            // But UserStatus is ACTIVE, DISABLED, DELETED.
            // If I disable the last ACTIVE admin, that's bad too?
            // The prompt says "if no other admin... page pops warning".
            // Let's protect against reducing the count of usable admins.
          }
        });
        
        // Refined check: Count ACTIVE admins.
        // If I am disabling/deleting, I shouldn't be the last ACTIVE admin.
        const activeAdminCount = await prisma.user.count({
            where: {
                role: 'ADMIN',
                status: 'ACTIVE'
            }
        });

        // If this user is an ACTIVE admin, and count <= 1, prevent.
        if (userToUpdate.status === 'ACTIVE' && activeAdminCount <= 1) {
             return res.status(400).json({ 
                error: 'Cannot disable/delete last active admin', 
                message: 'システムには最低1人の有効な管理者が必要です。' 
              });
        }
      }
    }

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
    // 管理者のCUSTOMカテゴリは管理者のみが見れる
    let whereCondition: any = {
      OR: [
        { type: 'SYSTEM' },
        { type: 'CUSTOM', createdById: currentUser.id },
      ],
      isDeleted: false,
    };

    // 管理者の場合、他の管理者のCUSTOMカテゴリは見せない
    if (currentUser.role === 'ADMIN') {
      whereCondition.OR = [
        { type: 'SYSTEM' },
        { type: 'CUSTOM', createdById: currentUser.id },
      ];
    }

    const categories = await prisma.category.findMany({
      where: whereCondition,
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
        defaultList: defaultList || 'SECONDARY', // デフォルトで副ボタンに設定
        bgColor: bgColor || null,
        borderColor: borderColor || null,
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
    const { orders } = req.body; // { id: number, priority: number, defaultList?: string }[]

    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    // トランザクションで一括更新
    await prisma.$transaction(
      orders.map((item: any) => {
        const data: any = { priority: item.priority };
        // Include defaultList if provided
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
    const { name, priority, bgColor, borderColor, defaultList } = req.body;

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
    if (bgColor !== undefined) data.bgColor = bgColor;
    if (borderColor !== undefined) data.borderColor = borderColor;
    if (defaultList !== undefined) data.defaultList = defaultList;

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
          isManual: false, // 通常作成
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
  try {
    const currentUser = getUser(req);
    const now = new Date();

    const activeLog = await prisma.workLog.findFirst({
      where: {
        userId: currentUser.id,
        endTime: null,
      },
    });

    if (!activeLog) {
      return res.status(404).json({ error: 'No active log found' });
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
        isEdited: true, // 内容変更フラグ
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
    
    // Get start of today (00:00:00) in JST (UTC+9)
    // Server might be in UTC, so new Date().setHours(0,0,0,0) would be 09:00 JST.
    // We want 00:00 JST, which is previous day 15:00 UTC.
    const now = new Date();
    const jstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    jstTime.setUTCHours(0, 0, 0, 0);
    const today = new Date(jstTime.getTime() - 9 * 60 * 60 * 1000);

    const logs = await prisma.workLog.findMany({
      where: {
        userId: currentUser.id,
        startTime: {
          gte: today,
        },
      },
      orderBy: {
        startTime: 'asc',
      },
      include: { category: true }
    });

    // 各項目のdurationを「次の項目の開始時間との差」で再計算
    const updatedLogs = logs.map((log, index) => {
      const nextLog = logs[index + 1];
      
      // 次のログがある場合：次のログの開始時間までをこのログの期間とする（隙間なし）
      if (nextLog) {
        const endTime = new Date(nextLog.startTime);
        const duration = Math.floor((endTime.getTime() - new Date(log.startTime).getTime()) / 1000);
        return {
          ...log,
          endTime: endTime.toISOString(),
          duration,
        };
      }

      // 次のログがない場合（最後のログ）：
      // DB上でendTimeがあれば（停止済み）、その値をそのまま使う
      if (log.endTime) {
         // durationがDBに入っていない場合の計算（念のため）
         const duration = log.duration ?? Math.floor((new Date(log.endTime).getTime() - new Date(log.startTime).getTime()) / 1000);
         return {
           ...log,
           endTime: new Date(log.endTime).toISOString(),
           duration
         };
      }

      // DB上でendTimeがない（進行中）：そのまま返す（duration: null）
      // フロントエンドで "進行中" と表示されるようになる
      return log;
    });

    res.json(updatedLogs.reverse()); // 表示は新しい順に戻す
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

    const { range, userIds, start, end } = req.query;
    const rangeStr = String(range || 'daily');

    let cutoffDate = new Date();
    let endDate: Date | undefined;

    if (rangeStr === 'weekly') {
      cutoffDate.setDate(cutoffDate.getDate() - 7);
    } else if (rangeStr === 'monthly') {
      // monthly now represents "Last 12 months" (Annual view)
      cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
    } else if (rangeStr === 'custom' && start && end) {
      cutoffDate = new Date(String(start));
      // Adjust start to beginning of day
      cutoffDate.setHours(0, 0, 0, 0);
      
      endDate = new Date(String(end));
      // Adjust end to end of day
      endDate.setHours(23, 59, 59, 999);
    } else {
      // daily (default)
      cutoffDate.setHours(cutoffDate.getHours() - 24);
    }

    const where: any = {
        startTime: {
          gte: cutoffDate,
        }
    };
    
    if (endDate) {
      where.startTime.lte = endDate;
    }

    if (userIds) {
        const ids = String(userIds).split(',').map(n => Number(n)).filter(n => !isNaN(n));
        if (ids.length > 0) {
            where.userId = { in: ids };
        }
    }

    const logs = await prisma.workLog.findMany({
      where,
      orderBy: { startTime: 'desc' },
      include: { user: true, category: true },
      take: 2000 // Increased limit
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

    const { userId, userIds, mode, start, end } = req.query;

    if ((!userId && !userIds) || !mode) {
      return res.status(400).json({ error: 'Missing userId(s) or mode' });
    }

    const modeStr = String(mode);
    if (!['day', 'week', 'month', 'year', 'custom'].includes(modeStr)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    // Determine target user IDs
    let targetIds: number[] = [];
    if (userIds) {
      targetIds = String(userIds).split(',').map(id => Number(id)).filter(n => !isNaN(n));
    } else if (userId) {
      targetIds = [Number(userId)];
    }

    if (targetIds.length === 0) {
       return res.status(400).json({ error: 'No valid user IDs provided' });
    }

    let rangeStart = new Date();
    let rangeEnd = new Date(); // Default to now
    let bucketCount = 0;
    let bucketMode = modeStr; // Internal mode for bucketing logic

    if (modeStr === 'custom') {
      if (!start || !end) {
        return res.status(400).json({ error: 'Missing start or end date for custom mode' });
      }
      rangeStart = new Date(String(start));
      rangeStart.setHours(0, 0, 0, 0);
      
      rangeEnd = new Date(String(end));
      rangeEnd.setHours(23, 59, 59, 999);

      const diffTime = Math.abs(rangeEnd.getTime() - rangeStart.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 31) {
        bucketMode = 'day';
        bucketCount = diffDays + 1; // Include end date
      } else if (diffDays <= 366) { // Up to 1 year
        bucketMode = 'month';
        // Adjust rangeStart to beginning of month for cleaner buckets if needed, or just keep custom start
        // Ideally align buckets to start date
        const months = (rangeEnd.getFullYear() - rangeStart.getFullYear()) * 12 + (rangeEnd.getMonth() - rangeStart.getMonth());
        bucketCount = months + 1;
      } else {
        bucketMode = 'year';
        const years = rangeEnd.getFullYear() - rangeStart.getFullYear();
        bucketCount = years + 1;
      }

    } else if (modeStr === 'day') {
      // 直近30日
      rangeStart.setDate(rangeStart.getDate() - 29);
      rangeStart.setHours(0, 0, 0, 0);
      bucketCount = 30;
      bucketMode = 'day';
    } else if (modeStr === 'week') {
      // 直近12週
      const day = rangeStart.getDay();
      const diffToMonday = (day + 6) % 7; 
      rangeStart.setDate(rangeStart.getDate() - diffToMonday);
      rangeStart.setHours(0, 0, 0, 0);
      rangeStart.setDate(rangeStart.getDate() - 7 * 11);
      bucketCount = 12;
      bucketMode = 'week';
    } else if (modeStr === 'month') {
      // month: 直近12ヶ月
      rangeStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 11, 1, 0, 0, 0, 0);
      bucketCount = 12;
      bucketMode = 'month';
    } else {
      // year: 直近5年
      rangeStart = new Date(rangeStart.getFullYear() - 4, 0, 1, 0, 0, 0, 0);
      bucketCount = 5;
      bucketMode = 'year';
    }

    // 対象ユーザーのログを取得
    const logs = await prisma.workLog.findMany({
      where: {
        userId: { in: targetIds },
        startTime: {
          gte: rangeStart,
          lte: rangeEnd,
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // バケット初期化
    type Bucket = { label: string; totalSeconds: number };
    const buckets: Bucket[] = [];

    if (bucketMode === 'day') {
      for (let i = 0; i < bucketCount; i++) {
        const d = new Date(rangeStart);
        d.setDate(rangeStart.getDate() + i);
        const label = d.toISOString().slice(0, 10); // YYYY-MM-DD
        buckets.push({ label, totalSeconds: 0 });
      }
    } else if (bucketMode === 'week') {
      for (let i = 0; i < bucketCount; i++) {
        const d = new Date(rangeStart);
        d.setDate(rangeStart.getDate() + i * 7);
        const year = d.getFullYear();
        const weekIndex = i + 1; 
        const label = `${year}-W${String(weekIndex).padStart(2, '0')}`;
        buckets.push({ label, totalSeconds: 0 });
      }
    } else if (bucketMode === 'month') {
      for (let i = 0; i < bucketCount; i++) {
        const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1);
        const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        buckets.push({ label, totalSeconds: 0 });
      }
    } else {
      // year
      for (let i = 0; i < bucketCount; i++) {
        const year = rangeStart.getFullYear() + i;
        const label = `${year}`;
        buckets.push({ label, totalSeconds: 0 });
      }
    }

    const byCategory: Record<string, number> = {};

    for (const log of logs) {
      const start = log.startTime;
      const durationSec = log.duration ?? (log.endTime ? Math.floor((log.endTime.getTime() - log.startTime.getTime()) / 1000) : 0);
      if (!durationSec) continue;

      let bucketIndex = -1;

      if (bucketMode === 'day') {
        const diffDays = Math.floor((start.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < bucketCount) {
          bucketIndex = diffDays;
        }
      } else if (bucketMode === 'week') {
        const diffDays = Math.floor((start.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.floor(diffDays / 7);
        if (diffWeeks >= 0 && diffWeeks < bucketCount) {
          bucketIndex = diffWeeks;
        }
      } else if (bucketMode === 'month') {
        const year = start.getFullYear();
        const month = start.getMonth();
        const startYear = rangeStart.getFullYear();
        const startMonth = rangeStart.getMonth();
        const diffMonths = (year - startYear) * 12 + (month - startMonth);
        if (diffMonths >= 0 && diffMonths < bucketCount) {
          bucketIndex = diffMonths;
        }
      } else {
        // year
        const year = start.getFullYear();
        const startYear = rangeStart.getFullYear();
        const diffYears = year - startYear;
        if (diffYears >= 0 && diffYears < bucketCount) {
          bucketIndex = diffYears;
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
    const { start, end, targetUid, userIds } = req.query;

    const where: any = {};
    
    // 一般ユーザーは自分のログしか見れない
    if (currentUser.role !== 'ADMIN') {
      where.userId = currentUser.id;
    } else {
      // Admin
      if (userIds) {
         // Multiple IDs (numerical)
         const ids = String(userIds).split(',').map(n => Number(n)).filter(n => !isNaN(n));
         if (ids.length > 0) {
            where.userId = { in: ids };
         }
      } else if (targetUid) {
        // Adminが特定ユーザーを指定した場合 (Legacy support for single UID)
        const target = await prisma.user.findUnique({ where: { uid: String(targetUid) } });
        if (target) where.userId = target.id;
      }
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

// GET /api/export/pdf
// 当日の履歴をPDFでダウンロード（閲覧のみ権限）
import PDFDocument from 'pdfkit';
import fs from 'fs';

router.get('/export/pdf', async (req: Request, res: Response) => {
  try {
    const currentUser = getUser(req);

    // Get today's logs (same logic as /logs/history)
    const now = new Date();
    const jstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    jstTime.setUTCHours(0, 0, 0, 0);
    const today = new Date(jstTime.getTime() - 9 * 60 * 60 * 1000);

    const logs = await prisma.workLog.findMany({
      where: {
        userId: currentUser.id,
        startTime: { gte: today },
      },
      orderBy: { startTime: 'asc' },
      include: { category: true }
    });

    // Calculate durations and format logs
    const formattedLogs = logs.map((log, index) => {
      let endTime = log.endTime;
      let duration = log.duration;

      const nextLog = logs[index + 1];
      if (nextLog) {
        endTime = nextLog.startTime;
        duration = Math.floor((new Date(endTime).getTime() - new Date(log.startTime).getTime()) / 1000);
      } else if (endTime) {
         duration = duration ?? Math.floor((new Date(endTime).getTime() - new Date(log.startTime).getTime()) / 1000);
      }

      // Determine Type Label
      let typeLabel = '通常';
      let showModTime = false;

      if (log.isManual) {
        if (log.isEdited) {
            typeLabel = '作成済(変更済)';
            showModTime = true;
        } else {
            typeLabel = '作成済';
            showModTime = true;
        }
      } else if (log.isEdited) {
        typeLabel = '変更済';
        showModTime = true;
      }

      return {
        task: log.categoryNameSnapshot,
        start: new Date(log.startTime).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }),
        end: endTime ? new Date(endTime).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }) : '進行中',
        duration: duration ? 
          `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m` : '-',
        type: typeLabel,
        modTime: showModTime ? new Date(log.updatedAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }) : '-'
      };
    });

    // Create PDF
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      userPassword: '', // No password to open
      ownerPassword: Math.random().toString(36), // Random owner password to restrict permissions
      permissions: {
        printing: 'highResolution',
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
      info: {
        Title: '業務日報',
        Author: 'Zimmeter',
      }
    });

    // Font setup (IPA P Gothic)
    // Check multiple paths (Host Ubuntu vs Container Alpine)
    const fontPaths = [
      '/usr/share/fonts/ipafont/ipagp.ttf',                 // Alpine (font-ipa) - Verified path
      '/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf', // Ubuntu/Debian
      '/usr/share/fonts/ipa/ipagp.ttf',                     // Alpine (older)
      '/usr/share/fonts/TTF/ipagp.ttf'                      // Other Linux
    ];

    let fontLoaded = false;
    for (const path of fontPaths) {
      if (fs.existsSync(path)) {
        doc.font(path);
        fontLoaded = true;
        break;
      }
    }

    if (!fontLoaded) {
      console.warn('Japanese font not found, falling back to default. Characters may not render correctly.');
    }

    // Response headers
    const filename = `daily_report_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Header
    doc.fontSize(20).text('業務日報', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(12).text(`氏名: ${currentUser.name || currentUser.uid}`);
    doc.text(`日付: ${new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    doc.moveDown();

    // Table Header
    const tableTop = doc.y;
    
    doc.fontSize(10);
    
    const col = {
        start: 40,
        end: 85,
        task: 130,
        type: 310,
        mod: 400,
        dur: 460
    };

    doc.text('開始', col.start, tableTop);
    doc.text('終了', col.end, tableTop);
    doc.text('業務内容', col.task, tableTop);
    doc.text('タイプ', col.type, tableTop);
    doc.text('変更時間', col.mod, tableTop);
    doc.text('時間', col.dur, tableTop);

    doc.moveTo(40, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    let y = tableTop + 25;

    // Rows
    formattedLogs.forEach((log) => {
        if (y > 750) { // New page if near bottom
            doc.addPage();
            y = 50;
        }

        doc.text(log.start, col.start, y);
        doc.text(log.end, col.end, y);
        doc.text(log.task, col.task, y, { width: 170 }); // Allow wrapping, limit width
        doc.text(log.type, col.type, y);
        doc.text(log.modTime, col.mod, y);
        doc.text(log.duration, col.dur, y);
        
        y += 20;
    });

    // Total Time
    const totalSeconds = logs.reduce((acc, log, index) => {
        let dur = log.duration || 0;
        // recalculate if needed (same logic as above)
        if (!log.endTime && logs[index+1]) {
             dur = Math.floor((new Date(logs[index+1].startTime).getTime() - new Date(log.startTime).getTime()) / 1000);
        } else if (log.endTime) {
             dur = Math.floor((new Date(log.endTime).getTime() - new Date(log.startTime).getTime()) / 1000);
        }
        return acc + dur;
    }, 0);

    const totalH = Math.floor(totalSeconds / 3600);
    const totalM = Math.floor((totalSeconds % 3600) / 60);

    doc.moveDown();
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 10;
    doc.fontSize(12).text(`合計作業時間: ${totalH}時間 ${totalM}分`, col.task, y);

    doc.end();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export PDF' });
    }
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
