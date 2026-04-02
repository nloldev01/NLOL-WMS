from rest_framework import serializers
from .models import Unit, FiscalYear, Asset, AssetParameter, Location, RawMaterialAndConsumable


# ── Unit ──────────────────────────────────────────────────────────────────────

class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Unit
        fields = ['id', 'name', 'code', 'symbol', 'description', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_code(self, value):
        return value.upper().strip()

    def validate_name(self, value):
        return value.strip()


# ── Fiscal Year ───────────────────────────────────────────────────────────────

class FiscalYearSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FiscalYear
        fields = ['id', 'name', 'start_date', 'end_date', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        start = data.get('start_date', getattr(self.instance, 'start_date', None))
        end   = data.get('end_date',   getattr(self.instance, 'end_date',   None))
        if start and end and start >= end:
            raise serializers.ValidationError("end_date must be after start_date.")
        return data

class LocationSerializer(serializers.ModelSerializer):
    full_code = serializers.SerializerMethodField()
    full_path = serializers.SerializerMethodField()
    parent_name = serializers.CharField(source='parent.name', read_only=True)

    class Meta:
        model  = Location
        fields = [
            'id',
            'name',
            'short_code',
            'type',
            'parent',
            'parent_name',
            'full_code',
            'full_path',
            'is_active',
        ]

    def get_full_code(self, obj):
        return obj.get_full_code()

    def get_full_path(self, obj):
        return obj.get_full_path()

    def validate(self, data):
        # Prevent circular parent reference
        parent = data.get('parent')
        if parent and parent == self.instance:
            raise serializers.ValidationError("A location cannot be its own parent.")
        return data
    
# ── Asset ─────────────────────────────────────────────────────────────────────

class AssetParameterSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source='unit.name', read_only=True)
    id = serializers.IntegerField(required=False)

    class Meta:
        model = AssetParameter
        fields = ['id', 'key', 'value', 'unit', 'unit_name']


class AssetSerializer(serializers.ModelSerializer):
    parameters = AssetParameterSerializer(many=True, required=False)
    capacity_unit_name = serializers.CharField(source='capacity_unit.name', read_only=True)
    location_detail = LocationSerializer(source='location', read_only=True)

    class Meta:
        model = Asset
        fields = [
            'id', 'name', 'asset_type', 'capacity', 'capacity_unit', 
            'capacity_unit_name', 'status', 'location', 'location_detail', 'parameters'
        ]
        extra_kwargs = {
            'location': {'required': True}
        }

    def create(self, validated_data):
        parameters_data = validated_data.pop('parameters', [])
        asset = Asset.objects.create(**validated_data)
        for param_data in parameters_data:
            AssetParameter.objects.create(asset=asset, **param_data)
        return asset

    def update(self, instance, validated_data):
        parameters_data = validated_data.pop('parameters', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if parameters_data is not None:
            existing_params = {p.id: p for p in instance.parameters.all()}
            for param_data in parameters_data:
                param_id = param_data.get('id')
                if param_id and param_id in existing_params:
                    # Update existing
                    param_obj = existing_params.pop(param_id)
                    for attr, val in param_data.items():
                        if attr != 'id':
                            setattr(param_obj, attr, val)
                    param_obj.save()
                else:
                    # Create new
                    param_data.pop('id', None) # remove id if present
                    AssetParameter.objects.create(asset=instance, **param_data)
            
            # Delete removed ones
            for p in existing_params.values():
                p.delete()

        return instance


# ── Raw Materials & Consumables ───────────────────────────────────────────────

class RawMaterialAndConsumableSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source='unit.name', read_only=True)
    unit_symbol = serializers.CharField(source='unit.symbol', read_only=True)
    type_display = serializers.CharField(source='get_type_display', read_only=True)

    class Meta:
        model  = RawMaterialAndConsumable
        fields = ['id', 'name', 'type', 'type_display', 'unit', 'unit_name', 'unit_symbol']
        read_only_fields = ['id']

    def validate_name(self, value):
        return value.strip()
