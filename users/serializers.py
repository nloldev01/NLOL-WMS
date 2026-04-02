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
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, min_length=0)

    class Meta:
        model = User
        fields = [
            'id', 'fullname', 'username', 'email',
            'user_role', 'user_role_id', 'phone', 'status',
            'last_login_date', 'ip', 'password'
        ]
        read_only_fields = ['last_login_date']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_password('password')  # default password
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
