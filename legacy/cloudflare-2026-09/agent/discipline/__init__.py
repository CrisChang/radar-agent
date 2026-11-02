"""Discipline layer: every fund-touching action passes through these guards.

Ported patterns from production trading bots. The agent should be boring
and auditable, because it holds a wallet.
"""

from .spending_cap import SpendingCap
from .idempotency import IdempotencyGuard
from .circuit_breaker import CircuitBreaker
from .audit_log import AuditLog

__all__ = ["SpendingCap", "IdempotencyGuard", "CircuitBreaker", "AuditLog"]
