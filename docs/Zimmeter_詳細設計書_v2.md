# 業務時間計測・管理システム 詳細設計書 (v2)

**Version**: 2.0
**Date**: 2024-12-18

## 1. アーキテクチャ更新点 (v2)

### 1.1 主な変更点
*   **DailyStatus導入**: ログの有無だけでなく、明示的な「退社」アクションと管理者の「補正」状態を永続化。
*   **レポート機能強化**: 年間集計、複数ユーザー選択、カスタム期間指定に対応。
*   **タイムゾーン**: サーバー(UTC)とクライアント/レポート(JST)の変換ロジックを厳密化。

## 2. バックエンド実装詳細 (API)

### 2.1 ログ・モニタリング API (`/api/logs`)

#### GET `/api/logs/monitor`
管理者用のアクティビティ監視エンドポイント。

*   **Query Parameters**:
    *   `range`: `daily` | `weekly` | `last30days` | `monthly` | `custom`
    *   `start`, `end`: `range=custom` 時の期間 (YYYY-MM-DD)
    *   `userIds`: カンマ区切りのユーザーIDリスト (例: `1,2,5`)
*   **Response**: `MonitorLog[]`
*   **Logic**:
    *   指定期間、指定ユーザーのログを取得。
    *   各ログに対して、同日の `DailyStatus` を参照し、ステータス表示用の情報をクライアントで結合する（またはBackendで結合して返す）。

#### GET `/api/logs/stats`
グラフ描画用の集計データ取得。

*   **Query Parameters**:
    *   `mode`: `daily` | `weekly` | `monthly` | `yearly` | `custom`
    *   `userIds`: 複数指定可。指定された場合、全対象ユーザーのデータを合算して集計する。
*   **Logic**:
    *   `yearly` モードの場合、直近5年分程度のデータを月ごとに集計する等のロジックが含まれる。

### 2.2 ステータス管理 API (`/api/status`) [New]

#### GET `/api/status/monitor`
指定期間・ユーザーの日次ステータス一覧を取得する。

*   **Query Parameters**:
    *   `start`, `end`: 必須 (YYYY-MM-DD)
    *   `userIds`: オプション
*   **Response**: `DailyStatus[]`

### 2.3 エクスポート API (`/api/export`)

#### GET `/api/export/csv`
*   **Logic update**:
    *   JST (UTC+9) の00:00 - 23:59 を正確に計算して抽出対象とする。
    *   **ステータス表示ロジック**:
        *   `isFixed=true`: "退社済(補正済)"
        *   `hasLeft=true`: "退社済"
        *   その他: "未退社" または "勤務中" (当日かつ最終ログの場合)
    *   **BOM付与**: Excelでの文字化け防止のため `\uFEFF` を先頭に付与。

### 2.4 ユーザー管理・カテゴリ API
*   Existing endpoints (`/api/users`, `/api/categories`) remain largely same as v1, with additions for frontend color preferences in categories.

## 3. フロントエンド実装詳細

### 3.1 MonitorTable コンポーネント
*   **Multi-Select**: `UserMultiSelectDropdown` を使用してフィルタリング。
*   **Status Logic**:
    *   APIから取得した `logs` と `dailyStatuses` をクライアントサイドで突き合わせる。
    *   日付の一致判定は `YYYY-MM-DD` 形式の文字列で行う。
*   **CSV Export**: クライアントサイドでのCSV生成ロジックも実装（表示内容と一致させる）。

### 3.2 グラフ表示 (AdminCharts)
*   **Recharts** を使用。
*   **Y軸制御**: マイナス値が入らないよう `Math.abs()` で補正して表示。
*   **Tooltip**: カテゴリ名と時間を詳細表示。

### 3.3 Status Guard (画面ロック)
*   v1同様、`useUserStatus` フックによるポーリング監視を継続。
*   `User.status` が `DISABLED` / `DELETED` に変化した瞬間、全画面オーバーレイを表示。

## 4. ディレクトリ構成 (更新)

```text
src/
├── components/
│   ├── Admin/
│   │   ├── MonitorTable.tsx     # v2: Multi-user, Status logic
│   │   ├── AdminCharts.tsx      # v2: Yearly, Custom range
│   │   └── UserMultiSelectDropdown.tsx # [New]
│   ├── Common/
│   │   ├── ChartPreviewModal.tsx # [New] 拡大表示
│   │   └── StatusGuard.tsx
│   └── ...
├── lib/
│   ├── constants.ts             # Category colors, common defs
│   └── axios.ts
└── pages/
    └── AdminPage.tsx            # 統合ダッシュボード
```
