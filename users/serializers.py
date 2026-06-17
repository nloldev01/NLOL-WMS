from rest_framework import serializers
from accounts.models import User, UserRole


class UserRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserRole
        fields = ['id', 'role']


class UserSerializer(serializers.ModelSerializer):
    user_role = UserRoleSerializer(read_only=True)
    user_role_id = serializers.PrimaryKeyRelatedField(
        queryset=UserRole.objects.all(),
        source='user_role',
        write_only=True
    )
    password = serializers.CharField(write_only=True, required=False, allow_blank=False, min_length=8)
    customer_id   = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'fullname', 'username', 'email',
            'user_role', 'user_role_id', 'phone', 'status',
            'is_2fa_enabled', 'last_login_date', 'ip', 'password',
            'customer_id', 'customer_name',
        ]
        read_only_fields = ['last_login_date', 'is_2fa_enabled', 'customer_id', 'customer_name']

    def get_customer_id(self, obj):
        try:
            return obj.customer.id
        except Exception:
            return None

    def get_customer_name(self, obj):
        try:
            return obj.customer.customer_name
        except Exception:
            return None

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({'password': 'Password is required when creating a user.'})
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
