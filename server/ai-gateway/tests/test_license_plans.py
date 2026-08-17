"""
测试套餐列表 API

覆盖：
- 返回三个套餐（月卡/年卡/终身）
- 各套餐字段正确（价格/周期/时长/推荐标记/多模态）
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

    def test_returns_three_plans(self):
        resp = client.get("/api/v1/license/plans")
        assert resp.status_code == 200
        data = resp.json()
        assert "plans" in data
        assert len(data["plans"]) == 3

    def test_pro_monthly_fields(self):
        resp = client.get("/api/v1/license/plans")
        monthly = [p for p in resp.json()["plans"] if p["id"] == "pro_monthly"][0]
        assert monthly["price"] == 12.0
        assert monthly["period"] == "month"
        assert monthly["duration_days"] == 30

    def test_pro_yearly_is_featured(self):
        resp = client.get("/api/v1/license/plans")
        yearly = [p for p in resp.json()["plans"] if p["id"] == "pro_yearly"][0]
        assert yearly["featured"] is True
        assert yearly["badge"] == "最受欢迎"
        assert yearly["savings"] == "省 ¥45"

    def test_lifetime_multimodal(self):
        resp = client.get("/api/v1/license/plans")
        lifetime = [p for p in resp.json()["plans"] if p["id"] == "lifetime"][0]
        assert lifetime["multimodal"] is True
        assert lifetime["daily_quota"] == 120
