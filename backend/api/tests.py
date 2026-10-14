from django.test import TestCase

from .models import Driver, Vehicle, Ticket, PUVType


class ModelSopFieldsTests(TestCase):
    def test_required_sop_fields_exist(self):
        self.assertTrue(hasattr(Driver, 'iwp_number'))
        self.assertTrue(hasattr(Driver, 'first_name'))
        self.assertTrue(hasattr(Driver, 'middle_name'))
        self.assertTrue(hasattr(Driver, 'gender'))
        self.assertTrue(hasattr(Driver, 'birthdate'))
        self.assertTrue(hasattr(Driver, 'province'))
        self.assertTrue(hasattr(Driver, 'city'))
        self.assertTrue(hasattr(Driver, 'barangay'))
        self.assertTrue(hasattr(Driver, 'street'))
        self.assertTrue(hasattr(Driver, 'photo'))

        self.assertTrue(hasattr(Vehicle, 'transportation_id'))
        self.assertTrue(hasattr(Vehicle, 'franchise_number'))
        self.assertTrue(hasattr(Vehicle, 'operator_address'))
        self.assertTrue(hasattr(Vehicle, 'qr_code'))

        self.assertTrue(hasattr(Ticket, 'mode'))
        self.assertTrue(hasattr(Ticket, 'remittance_batch'))


class PaperIssuanceTests(TestCase):
    def setUp(self):
        from .models import Requisition, TicketForm, TicketSeries
        form = TicketForm.objects.create(name='Std', price=10)
        req = Requisition.objects.create()
        self.series = TicketSeries.objects.create(
            series_no='S1', ticket_form=form, start_no='1', end_no='1000', unit_value=0, requisition=req,
        )
        self.form = form

    def _paper(self, a, b):
        from .models import PaperIssuance
        from datetime import date
        return PaperIssuance.objects.create(series=self.series, from_no=a, to_no=b, used_on=date.today())

    def test_allocator_skips_paper_range_and_out_of_order_ranges(self):
        from .views.viewsets import _consume_series_fifo
        self._paper(1, 624)
        self._paper(700, 710)
        units = _consume_series_fifo(self.form.id, 3)
        self.assertEqual([u[1] for u in units], ['625', '626', '627'])

    def test_stock_and_amount_count_paper(self):
        from .serializers import TicketSeriesSerializer, PaperIssuanceSerializer
        p = self._paper(1, 624)
        self.assertEqual(p.amount, 6240)
        self.assertEqual(TicketSeriesSerializer(self.series).data['remaining'], 376)
        self.assertEqual(PaperIssuanceSerializer(p).data['count'], 624)

    def test_validation_rejects_overlap_and_out_of_series(self):
        from .serializers import PaperIssuanceSerializer
        from datetime import date
        self._paper(1, 624)
        base = {'series': self.series.id, 'used_on': date.today().isoformat(), 'reason': 'SYSTEM_DOWN'}
        for a, b in [(600, 650), (990, 1001), (5, 2)]:
            s = PaperIssuanceSerializer(data={**base, 'from_no': a, 'to_no': b})
            self.assertFalse(s.is_valid(), (a, b))
        self.assertTrue(PaperIssuanceSerializer(data={**base, 'from_no': 625, 'to_no': 630}).is_valid())

    def test_next_free_skips_paper_and_system_numbers(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .models import User
        from .views import PaperIssuanceViewSet
        self._paper(1, 624)
        user = User.objects.create_user(username='a', password='x', role='SUPERADMIN')
        req = APIRequestFactory().get('/paper-issuances/next-free/', {'series': self.series.id})
        force_authenticate(req, user=user)
        res = PaperIssuanceViewSet.as_view({'get': 'next_free'})(req)
        self.assertEqual(res.data['next_free'], 625)

    def test_last_used_no_covers_paper_and_system_tickets(self):
        from .serializers import TicketSeriesSerializer
        self.assertIsNone(TicketSeriesSerializer(self.series).data['last_used_no'])
        self._paper(1, 624)
        self.assertEqual(TicketSeriesSerializer(self.series).data['last_used_no'], 624)

    def test_paper_cash_is_reported_but_not_expected(self):
        from datetime import date
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .models import User
        from .views.reports import eod_reconciliation
        user = User.objects.create_user(username='b', password='x', role='SUPERADMIN')
        self._paper(1, 494)  # 494 x 10 = 4,940, remitted at the treasury
        req = APIRequestFactory().get('/report/eod-reconciliation/', {'date': date.today().isoformat()})
        force_authenticate(req, user=user)
        data = eod_reconciliation(req).data
        self.assertEqual(data['paper_count'], 494)
        self.assertEqual(data['paper_amount'], 4940.0)
        self.assertEqual(data['expected_cash'], 0.0)
        self.assertEqual(data['difference'], 0.0)

    def _void(self):
        from rest_framework.test import APIClient
        from .models import User
        client = APIClient()
        client.force_authenticate(User.objects.create_user(username='v', password='x', role='SUPERADMIN'))
        return client.post(f'/api/ticket-series/{self.series.id}/void/')

    def test_void_frees_range_for_reentry(self):
        from .models import Requisition, TicketSeries
        self.assertEqual(self._void().status_code, 204)
        self.assertFalse(TicketSeries.objects.exists())
        self.assertFalse(Requisition.objects.exists())  # it held only this series
        again = TicketSeries.objects.create(
            series_no='S1', ticket_form=self.form, start_no='1', end_no='1000', unit_value=0,
            requisition=Requisition.objects.create(),
        )
        self.assertTrue(again.pk)

    def test_void_blocked_once_range_is_used(self):
        from .models import TicketSeries
        self._paper(1, 5)
        res = self._void()
        self.assertEqual(res.status_code, 400)
        self.assertTrue(TicketSeries.objects.filter(pk=self.series.pk).exists())


class ArchivableSettingsTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from .models import Route, User
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user(username='c', password='x', role='SUPERADMIN'))
        self.route = Route.objects.create(origin='Bacnotan')
        self.puv = PUVType.objects.create(name='Jeepney')

    def test_in_use_cannot_be_deleted_but_can_be_archived_and_restored(self):
        Vehicle.objects.create(plate_number='ABC123', route=self.route, transportation_id=self.puv)
        for path in (f'/api/routes/{self.route.id}/', f'/api/puvtypes/{self.puv.id}/'):
            res = self.client.delete(path)
            self.assertEqual(res.status_code, 409, path)
            self.assertIn('Archive it instead', res.data['detail'])

        self.assertEqual(self.client.put(f'/api/routes/{self.route.id}/', {'origin': 'Bacnotan', 'is_archived': True}).status_code, 200)
        self.assertEqual(self.client.get('/api/routes/').data, [])
        archived = self.client.get('/api/routes/?is_archived=true').data
        self.assertEqual([(r['id'], r['vehicle_count']) for r in archived], [(self.route.id, 1)])
        self.client.put(f'/api/routes/{self.route.id}/', {'origin': 'Bacnotan', 'is_archived': False})
        self.assertEqual(len(self.client.get('/api/routes/').data), 1)

    def test_unused_can_be_deleted(self):
        self.assertEqual(self.client.delete(f'/api/routes/{self.route.id}/').status_code, 204)


class OfflineStaffRegistrationTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from .models import User
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user(username='adm', password='x', role='SUPERADMIN'))
        self.payload = {'username': 'new@staff.ph', 'first_name': 'New', 'last_name': 'Staff', 'role': 'PERSONNEL'}

    def test_login_email_is_parked_while_mail_is_down_then_sent(self):
        from unittest import mock
        from django.test import override_settings
        from .models import PendingAccountEmail, User
        from .sync.account_emails import flush_account_emails

        with override_settings(DEBUG=True):
            with mock.patch('api.views.viewsets.send_new_account_email', side_effect=OSError('offline')):
                res = self.client.post('/api/users/', self.payload)
            self.assertEqual(res.status_code, 201)
            self.assertTrue(res.data['email_queued'])
            parked = PendingAccountEmail.objects.get()

            with mock.patch('api.views.viewsets.send_new_account_email') as send:
                self.assertEqual(flush_account_emails(), 1)
            send.assert_called_once()
            self.assertEqual(send.call_args.args[1], parked.temp_password)
            self.assertTrue(User.objects.get(username='new@staff.ph').check_password(parked.temp_password))
            self.assertFalse(PendingAccountEmail.objects.exists())

    def test_account_created_offline_is_parked_and_not_emailed_until_pushed(self):
        from unittest import mock
        from .models import LOCAL_ADMIN_PK_BASE, PendingAccountEmail, PendingSetting
        from .sync.account_emails import flush_account_emails

        with mock.patch('api.views.helpers.supabase_reachable', return_value=False):
            res = self.client.post('/api/users/', self.payload)
        self.assertEqual(res.status_code, 201)
        self.assertGreater(res.data['id'], LOCAL_ADMIN_PK_BASE)
        self.assertTrue(res.data['email_queued'])
        self.assertTrue(PendingSetting.objects.filter(model_label='api.User', obj_id=res.data['id']).exists())

        with mock.patch('api.views.helpers.supabase_reachable', return_value=True), \
                mock.patch('api.views.viewsets.send_new_account_email') as send:
            self.assertEqual(flush_account_emails(), 0)
        send.assert_not_called()
        self.assertTrue(PendingAccountEmail.objects.exists())
