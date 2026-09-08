"""SMS message templates for queue position alerts.

Both are wired in: queue_position_message() is sent from
TicketSerializer.create() (api/serializers.py) the moment a vehicle checks
into the queue, and queue_next_message() is sent from the dispatch_ticket
action (api/views/viewsets.py) to whoever becomes #1 once the vehicle ahead
is dispatched.
"""

TERMINAL_NAME = "North Central Terminal, San Fernando"


def queue_position_message(queue_number, route_name=None):
    """Sent the moment a vehicle checks into the queue, telling it its
    current queue number. Caller should skip this when queue_number == 1 —
    that vehicle is already heading straight to the loading bay and doesn't
    need telling."""
    route = f" for {route_name}" if route_name else ""
    return (
        f"{TERMINAL_NAME}: You are currently #{queue_number} in line{route}. "
        f"Please be ready - you'll be called to load soon."
    )


def queue_next_message(route_name=None):
    """Sent once a vehicle becomes #1 in line, ready for dispatch."""
    route = f" for {route_name}" if route_name else ""
    return f"{TERMINAL_NAME}: You're next{route}! Please proceed to the loading bay now."
