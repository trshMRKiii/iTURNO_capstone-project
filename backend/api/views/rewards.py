from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import Driver, DriverRewardProfile, PointsTransaction, Redemption
from ..serializers import DriverRewardProfileSerializer, PointsTransactionSerializer, RedemptionSerializer
from ..rewards import get_or_create_profile, can_redeem, redeem_points


@api_view(['GET'])
def reward_summary(request, driver_id):
    try:
        driver = Driver.objects.get(id=driver_id)
    except Driver.DoesNotExist:
        return Response({"error": "Driver not found"}, status=404)

    profile = get_or_create_profile(driver)
    serializer = DriverRewardProfileSerializer(profile)
    return Response(serializer.data)


@api_view(['GET'])
def reward_history(request, driver_id):
    try:
        driver = Driver.objects.get(id=driver_id)
    except Driver.DoesNotExist:
        return Response({"error": "Driver not found"}, status=404)

    profile = get_or_create_profile(driver)
    transactions = PointsTransaction.objects.filter(profile=profile)

    tx_type = request.query_params.get('type')
    if tx_type:
        transactions = transactions.filter(type=tx_type)

    limit = int(request.query_params.get('limit', 50))
    transactions = transactions[:limit]

    serializer = PointsTransactionSerializer(transactions, many=True)
    return Response({
        'transactions': serializer.data,
        'total_points': profile.total_points,
    })


@api_view(['GET'])
def reward_redemptions(request, driver_id):
    try:
        driver = Driver.objects.get(id=driver_id)
    except Driver.DoesNotExist:
        return Response({"error": "Driver not found"}, status=404)

    profile = get_or_create_profile(driver)
    redemptions = Redemption.objects.filter(profile=profile)
    serializer = RedemptionSerializer(redemptions, many=True)
    return Response({'redemptions': serializer.data})


@api_view(['POST'])
def reward_redeem(request, driver_id):
    try:
        driver = Driver.objects.get(id=driver_id)
    except Driver.DoesNotExist:
        return Response({"error": "Driver not found"}, status=404)

    profile = get_or_create_profile(driver)
    approved_by = request.user if request.user.is_authenticated else None
    redemption, message = redeem_points(profile, approved_by=approved_by)

    if redemption is None:
        return Response({"error": message}, status=400)

    return Response({
        "message": message,
        "redemption": RedemptionSerializer(redemption).data,
        "remaining_points": profile.total_points,
    }, status=201)


@api_view(['GET'])
def reward_leaderboard(request):
    profiles = DriverRewardProfile.objects.select_related('driver').order_by('-total_points')[:20]
    serializer = DriverRewardProfileSerializer(profiles, many=True)
    return Response({'leaderboard': serializer.data})
