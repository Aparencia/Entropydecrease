"""
测试套餐列表 API（充值系统重构后：6 会员 + 4 额度包）

覆盖：
- 返回 10 个套餐（6 会员时长 + 4 AI 额度包）
- 会员套餐字段正确（价格/周期/时长/推荐标记/多模态）
- 额度包不升级 tier（daily_quota=0、period=quota）
- 无需认证即可访问
"""

import sys
from pathlib import Path

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


class TestGetPlans:
    """套餐列表接口（无需认证）"""

    def test_returns_ten_plans(self):
        resp = client.get("/api/v1/license/plans")
        assert resp.status_code == 200
        data = resp.json()
        assert "plans" in data
        assert len(data["plans"]) == 10

    def test_member_plan_fields(self):
        resp = client.get("/api/v1/license/plans")
        plans = {p["id"]: p for p in resp.json()["plans"]}
        # 月卡：最受欢迎 featured
        monthly = plans["mem_1m"]
        assert monthly["price"] == 12.0
        assert monthly["period"] == "month"
        assert monthly["duration_days"] == 30
        assert monthly["featured"] is True
        assert monthly["badge"] == "最受欢迎"
        # 年卡：省 ¥45
        yearly = plans["mem_1y"]
        assert yearly["price"] == 99.0
        assert yearly["duration_days"] == 365
        assert yearly["savings"] == "省 ¥45"
        # 终身：多模态 + 120 配额
        lifetime = plans["mem_life"]
        assert lifetime["multimodal"] is True
        assert lifetime["daily_quota"] == 120
        # 体验日卡：1 天
        assert plans["mem_1d"]["duration_days"] == 1
        assert plans["mem_7d"]["duration_days"] == 7
        assert plans["mem_3m"]["duration_days"] == 90

    def test_quota_pack_fields(self):
        resp = client.get("/api/v1/license/plans")
        plans = {p["id"]: p for p in resp.json()["plans"]}
        # 额度包：period=quota、daily_quota=0（不升级 tier）
        ai_200 = plans["ai_200"]
        assert ai_200["period"] == "quota"
        assert ai_200["daily_quota"] == 0
        assert ai_200["featured"] is True
        assert ai_200["badge"] == "超值"
        assert plans["ai_50"]["price"] == 5.0
        assert plans["ai_500"]["price"] == 35.0
        assert plans["ai_inf"]["price"] == 99.0
