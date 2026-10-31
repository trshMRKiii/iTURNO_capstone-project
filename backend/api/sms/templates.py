"""SMS message templates for queue position alerts.

All are wired in: queue_position_message() / queue_first_message() are sent
from TicketSerializer.create() (api/serializers.py) the moment a vehicle
checks into the queue (behind others / into an empty queue), and
queue_next_message() is sent from the dispatch_ticket
action (api/views/viewsets.py) to whoever becomes #1 once the vehicle ahead
is dispatched.
"""

TERMINAL_NAME = "North Central Terminal"


def _compose(*lines):
    """Join non-empty lines with newlines so each fact sits on its own row."""
    return "\n".join(line for line in lines if line)


def queue_position_message(queue_number, route_name=None):
    """Sent the moment a vehicle checks into the queue behind others,
    telling it its current queue number. A vehicle arriving at #1 gets
    queue_first_message() instead."""
    return _compose(
        TERMINAL_NAME,
        
        f"You're in line: #{queue_number}",
        f"Route: {route_name}" if route_name else "",
        "Please stay nearby. We'll text you when it's your turn.",
    )


def queue_first_message(route_name=None):
    """Sent when a vehicle checks into an empty queue and is #1 right away."""
    return _compose(
        TERMINAL_NAME,
        "You're first in line!",
        f"Route: {route_name}" if route_name else "",
        "Please proceed to the loading bay.",
    )


def queue_next_message(route_name=None):
    """Sent once a vehicle becomes #1 in line, ready for dispatch."""
    return _compose(
        TERMINAL_NAME,
        "You're next!",
        f"Route: {route_name}" if route_name else "",
        "Please proceed to the loading bay.",
    )
