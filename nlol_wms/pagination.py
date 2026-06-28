from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    """Shared page-number pagination for high-volume list endpoints.

    Returns ``{count, next, previous, results}``. Clients can override the
    page size with ``?page_size=`` up to ``max_page_size``.
    """
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 200


class OptionalResultsPagination(StandardResultsPagination):
    """Opt-in pagination for endpoints that ALSO feed dropdowns/joins.

    Only paginates when a ``?page=`` query param is present. Without it, the
    endpoint returns the full unpaginated list (a plain array), preserving
    backwards-compatibility for callers that expect every row (e.g. select
    dropdowns), while list pages can opt into paging by sending ``?page=``.
    """

    def paginate_queryset(self, queryset, request, view=None):
        if self.page_query_param not in request.query_params:
            return None
        return super().paginate_queryset(queryset, request, view)
